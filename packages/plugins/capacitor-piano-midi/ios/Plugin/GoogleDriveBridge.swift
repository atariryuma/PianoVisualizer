// Google sign-in + Drive access for cloud sync.
//
// The tokens stay on this side of the bridge: JS asks for a Drive request and
// gets back a status and a body, so nothing in the WebView can read a token.
// Going through URLSession also means WebView CORS rules do not apply.
//
//   - Sign-in uses ASWebAuthenticationSession + PKCE. Google refuses OAuth inside
//     an embedded WebView, and an iOS client has no secret.
//   - Only the `drive.appdata` scope is requested: the app's private folder in the
//     player's own Drive. No email or profile, so we never learn who they are.
//   - The refresh token lives in the Keychain, ThisDeviceOnly: a device transfer
//     must sign in again rather than inherit it.
//   - Requests are limited to the Drive API paths below.

import Foundation
import AuthenticationServices
import CryptoKit
import Security

enum GoogleDriveBridgeError: Error {
    case cancelled
    case scopeDenied
    case badResponse(String)
    case pathNotAllowed
}

private enum GoogleEndpoint {
    static let authorize = "https://accounts.google.com/o/oauth2/v2/auth"
    static let token = "https://oauth2.googleapis.com/token"
    static let revoke = "https://oauth2.googleapis.com/revoke"
    static let driveHost = "https://www.googleapis.com"
    static let scope = "https://www.googleapis.com/auth/drive.appdata"
}

private enum RefreshTokenStore {
    private static let service = "com.pianovisualizer.google-drive"
    private static let account = "refresh-token"

    private static var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }

    static func load() -> String? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
              let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func save(_ token: String) {
        SecItemDelete(baseQuery as CFDictionary)
        var query = baseQuery
        query[kSecValueData as String] = Data(token.utf8)
        query[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(query as CFDictionary, nil)
    }

    static func delete() {
        SecItemDelete(baseQuery as CFDictionary)
    }
}

@MainActor
private final class WebAuthPresenter: NSObject, ASWebAuthenticationPresentationContextProviding {
    private let anchor: ASPresentationAnchor
    private var session: ASWebAuthenticationSession?

    init(anchor: ASPresentationAnchor) {
        self.anchor = anchor
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor
    }

    func authenticate(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(
                url: url,
                callbackURLScheme: callbackScheme
            ) { callback, error in
                if let callback = callback {
                    continuation.resume(returning: callback)
                } else if let error = error as? ASWebAuthenticationSessionError,
                          error.code == .canceledLogin {
                    continuation.resume(throwing: GoogleDriveBridgeError.cancelled)
                } else {
                    continuation.resume(
                        throwing: error ?? GoogleDriveBridgeError.badResponse("no callback")
                    )
                }
            }
            session.presentationContextProvider = self
            self.session = session
            if !session.start() {
                continuation.resume(throwing: GoogleDriveBridgeError.badResponse("session did not start"))
            }
        }
    }
}

actor GoogleDriveBridge {
    private var accessToken: String?
    private var accessTokenExpiry = Date.distantPast

    // MARK: - Sign-in

    func signIn(clientId: String, anchor: ASPresentationAnchor) async throws {
        let verifier = Self.randomURLSafe(byteCount: 48)
        let challenge = Self.base64URL(Data(SHA256.hash(data: Data(verifier.utf8))))
        let state = Self.randomURLSafe(byteCount: 16)
        let scheme = Self.reversedScheme(clientId: clientId)
        let redirectURI = scheme + ":/oauth2redirect"

        var components = URLComponents(string: GoogleEndpoint.authorize)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: GoogleEndpoint.scope),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]
        let authURL = components.url!

        let presenter = await WebAuthPresenter(anchor: anchor)
        let callback = try await presenter.authenticate(url: authURL, callbackScheme: scheme)

        let items = URLComponents(url: callback, resolvingAgainstBaseURL: false)?.queryItems ?? []
        func value(_ name: String) -> String? { items.first { $0.name == name }?.value }
        if value("error") == "access_denied" { throw GoogleDriveBridgeError.cancelled }
        guard value("state") == state, let code = value("code") else {
            throw GoogleDriveBridgeError.badResponse("invalid sign-in callback")
        }

        let body = try await postForm(GoogleEndpoint.token, [
            "grant_type": "authorization_code",
            "client_id": clientId,
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirectURI,
        ])
        // Google's consent screen lets the player untick the Drive permission, and
        // sign-in still succeeds. Say so now rather than fail on every sync.
        let granted = (body["scope"] as? String ?? "").split(separator: " ").map(String.init)
        guard granted.contains(GoogleEndpoint.scope) else {
            throw GoogleDriveBridgeError.scopeDenied
        }
        guard let refresh = body["refresh_token"] as? String else {
            throw GoogleDriveBridgeError.badResponse("no refresh token")
        }
        RefreshTokenStore.save(refresh)
        adopt(body)
    }

    func signOut() async {
        let token = RefreshTokenStore.load()
        RefreshTokenStore.delete()
        accessToken = nil
        accessTokenExpiry = .distantPast
        // Best effort: the local sign-out has already happened either way.
        if let token = token {
            _ = try? await postForm(GoogleEndpoint.revoke, ["token": token])
        }
    }

    // MARK: - Drive

    /// Returns the HTTP status and body. 401 means "sign in again".
    func request(
        clientId: String,
        method: String,
        path: String,
        contentType: String?,
        body: String?
    ) async throws -> (status: Int, body: String) {
        guard path.hasPrefix("/drive/v3/") || path.hasPrefix("/upload/drive/v3/"),
              let url = URL(string: GoogleEndpoint.driveHost + path) else {
            throw GoogleDriveBridgeError.pathNotAllowed
        }
        guard let token = try await validAccessToken(clientId: clientId) else {
            return (401, "")
        }
        var result = try await send(url, method, token, contentType, body)
        if result.status == 401 {
            // Revoked or expired early: refresh once before reporting it.
            accessToken = nil
            guard let fresh = try await validAccessToken(clientId: clientId) else {
                return (401, "")
            }
            result = try await send(url, method, fresh, contentType, body)
        }
        return result
    }

    private func send(
        _ url: URL,
        _ method: String,
        _ token: String,
        _ contentType: String?,
        _ body: String?
    ) async throws -> (status: Int, body: String) {
        var request = URLRequest(url: url, timeoutInterval: 30)
        request.httpMethod = method
        request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        if let contentType = contentType {
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        if let body = body {
            request.httpBody = Data(body.utf8)
        }
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        return (status, String(data: data, encoding: .utf8) ?? "")
    }

    // MARK: - Tokens

    private func validAccessToken(clientId: String) async throws -> String? {
        if let token = accessToken, accessTokenExpiry > Date() { return token }
        guard let refresh = RefreshTokenStore.load() else { return nil }
        do {
            let body = try await postForm(GoogleEndpoint.token, [
                "grant_type": "refresh_token",
                "client_id": clientId,
                "refresh_token": refresh,
            ])
            adopt(body)
            return accessToken
        } catch GoogleDriveBridgeError.badResponse(let reason) where reason.contains("invalid_grant") {
            // Revoked by the player, or expired: while the OAuth app is in Testing,
            // Google expires these after 7 days.
            RefreshTokenStore.delete()
            return nil
        }
    }

    private func adopt(_ body: [String: Any]) {
        accessToken = body["access_token"] as? String
        let lifetime = (body["expires_in"] as? Double) ?? 3600
        accessTokenExpiry = Date().addingTimeInterval(max(0, lifetime - 60))
    }

    private func postForm(_ endpoint: String, _ fields: [String: String]) async throws -> [String: Any] {
        var allowed = CharacterSet.alphanumerics
        allowed.insert(charactersIn: "-._~")
        var request = URLRequest(url: URL(string: endpoint)!, timeoutInterval: 30)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
        request.httpBody = fields
            .map { key, value in
                let encoded = value.addingPercentEncoding(withAllowedCharacters: allowed) ?? ""
                return key + "=" + encoded
            }
            .joined(separator: "&")
            .data(using: .utf8)
        let (data, response) = try await URLSession.shared.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        let json = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] ?? [:]
        guard (200..<300).contains(status) else {
            // Only the error code: the rest of the body is not needed for diagnosis.
            throw GoogleDriveBridgeError.badResponse(
                "token endpoint \(status): \(json["error"] as? String ?? "unknown")"
            )
        }
        return json
    }

    // MARK: - Helpers

    private static func reversedScheme(clientId: String) -> String {
        let suffix = ".apps.googleusercontent.com"
        let prefix = clientId.hasSuffix(suffix) ? String(clientId.dropLast(suffix.count)) : clientId
        return "com.googleusercontent.apps." + prefix
    }

    private static func randomURLSafe(byteCount: Int) -> String {
        var bytes = [UInt8](repeating: 0, count: byteCount)
        _ = SecRandomCopyBytes(kSecRandomDefault, byteCount, &bytes)
        return base64URL(Data(bytes))
    }

    private static func base64URL<D: DataProtocol>(_ data: D) -> String {
        Data(data).base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }
}
