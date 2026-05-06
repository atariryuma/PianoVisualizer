Add-Type -AssemblyName System.Net
Add-Type -AssemblyName System.Security

$serverDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$port = 8443
$certPath = Join-Path $serverDir "cert.pfx"
$certPass = if ([string]::IsNullOrWhiteSpace($env:PIANO_CERT_PASS)) { "piano123" } else { $env:PIANO_CERT_PASS }
$logPath = Join-Path $serverDir "server.log"
# Block server-only files from being served to LAN clients:
#   - cert.pfx          : private key + cert
#   - cert.cer          : also private (export marker; intentionally NOT blocked
#                         here because the iPad install path needs it — see
#                         CLAUDE.md "iPad / strict-cert browser setup")
#   - https_server.ps1  : exposing the server source itself adds nothing
#   - gen_cert.ps1      : leaks the default cert password literal "piano123"
#   - server.log        : contains every client's UA + every /log POST body
#                         (debug dumps that may include score data, device info)
$blockedFiles = @("cert.pfx", "https_server.ps1", "gen_cert.ps1", "server.log")

function Write-Log([string]$message) {
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp $message" | Out-File $logPath -Append -Encoding utf8
}

# UA-based client tag for /log entries. Previously hardcoded as "iPad" which
# misled when other devices (Steam Deck, desktop browsers) hit the same endpoint.
function Get-ClientTag([hashtable]$hdrs) {
    $ua = $hdrs["User-Agent"]
    if (-not $ua) { return "Unknown" }
    if ($ua -match "iPad")             { return "iPad" }
    if ($ua -match "iPhone")           { return "iPhone" }
    if ($ua -match "Android")          { return "Android" }
    if ($ua -match "Macintosh|Mac OS X") { return "Mac" }
    if ($ua -match "Linux")            { return "Linux" }
    if ($ua -match "Windows")          { return "Windows" }
    return "Web"
}

function Send-Response(
    [System.Net.Security.SslStream]$stream,
    [int]$statusCode,
    [string]$reason,
    [byte[]]$body,
    [string]$contentType
) {
    if (-not $body) { $body = [byte[]]@() }
    if ([string]::IsNullOrWhiteSpace($contentType)) { $contentType = "text/plain; charset=utf-8" }

    $header = "HTTP/1.1 $statusCode $reason`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $stream.Write($headerBytes, 0, $headerBytes.Length)

    if ($body.Length -gt 0) {
        $stream.Write($body, 0, $body.Length)
    }
}

$mimeMap = @{
    ".html" = "text/html; charset=utf-8"
    ".js"   = "application/javascript; charset=utf-8"
    ".css"  = "text/css; charset=utf-8"
    ".json" = "application/json; charset=utf-8"
    ".txt"  = "text/plain; charset=utf-8"
    ".svg"  = "image/svg+xml"
    ".png"  = "image/png"
    ".jpg"  = "image/jpeg"
    ".jpeg" = "image/jpeg"
    ".ico"  = "image/x-icon"
    ".cer"  = "application/pkix-cert"
    ".crt"  = "application/pkix-cert"
}

if (-not (Test-Path $certPath -PathType Leaf)) {
    throw "Certificate file not found: $certPath"
}

$cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($certPath, $certPass)
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)
$listener.Start()

"Server started on port $port" | Out-File $logPath -Encoding utf8
Write-Log "Serving files from $serverDir"

$serverRoot = $serverDir
if (-not $serverRoot.EndsWith([System.IO.Path]::DirectorySeparatorChar)) {
    $serverRoot += [System.IO.Path]::DirectorySeparatorChar
}

while ($true) {
    $client = $listener.AcceptTcpClient()
    $client.ReceiveTimeout = 5000
    $client.SendTimeout = 5000

    $sslStream = New-Object System.Net.Security.SslStream($client.GetStream(), $false)
    $reader = $null

    try {
        $sslStream.AuthenticateAsServer($cert, $false, [System.Security.Authentication.SslProtocols]::Tls12, $false)
        $reader = New-Object System.IO.StreamReader(
            $sslStream,
            [System.Text.Encoding]::ASCII,
            $false,
            1024,
            $true
        )

        $requestLine = $reader.ReadLine()
        if ([string]::IsNullOrWhiteSpace($requestLine)) {
            Send-Response -stream $sslStream -statusCode 400 -reason "Bad Request" -body ([System.Text.Encoding]::UTF8.GetBytes("Bad Request")) -contentType "text/plain; charset=utf-8"
            continue
        }

        # v10: Parse headers
        $headers = @{}
        while ($true) {
            $line = $reader.ReadLine()
            if ([string]::IsNullOrEmpty($line)) { break }
            $parts = $line -split ":", 2
            if ($parts.Length -ge 2) {
                $headers[$parts[0].Trim()] = $parts[1].Trim()
            }
        }

        $parts = $requestLine -split " "
        if ($parts.Length -lt 2) {
            Send-Response -stream $sslStream -statusCode 400 -reason "Bad Request" -body ([System.Text.Encoding]::UTF8.GetBytes("Bad Request")) -contentType "text/plain; charset=utf-8"
            continue
        }

        $method = $parts[0].ToUpperInvariant()
        $rawTarget = $parts[1]
        $requestPath = ($rawTarget -split "\?")[0]

        # v10: Handle POST /log
        if ($method -eq "POST" -and $requestPath -eq "/log") {
            $length = 0
            if ($headers.ContainsKey("Content-Length")) {
                $length = [int]$headers["Content-Length"]
            }
            if ($length -gt 0) {
                $buffer = New-Object char[] $length
                $reader.Read($buffer, 0, $length) | Out-Null
                # Fix: Use [string]::new constructor to avoid array unrolling issues
                $bodyStr = [string]::new($buffer)
                $now = Get-Date -Format "HH:mm:ss"
                # NOTE: Don't overwrite $client — it's the TcpClient handle from
                # line 81 and the per-iteration cleanup needs it intact.
                $clientTag = Get-ClientTag $headers
                Write-Host "[$now $clientTag Log] $bodyStr" -ForegroundColor Cyan
                Write-Log "[$clientTag] $bodyStr"
            }
            Send-Response -stream $sslStream -statusCode 200 -reason "OK" -body ([System.Text.Encoding]::UTF8.GetBytes("Logged")) -contentType "text/plain; charset=utf-8"
            continue
        }

        if ($method -ne "GET") {
            Send-Response -stream $sslStream -statusCode 405 -reason "Method Not Allowed" -body ([System.Text.Encoding]::UTF8.GetBytes("Method Not Allowed")) -contentType "text/plain; charset=utf-8"
            continue
        }

        # Default to index.html (the canonical entry as of 2026-05-05).
        if ($requestPath -eq "/" -or [string]::IsNullOrWhiteSpace($requestPath)) {
            $requestPath = "/index.html"
        }

        $decodedPath = [System.Uri]::UnescapeDataString($requestPath)
        $relativePath = $decodedPath.TrimStart("/").Replace("/", [System.IO.Path]::DirectorySeparatorChar)
        if ([string]::IsNullOrWhiteSpace($relativePath)) {
            $relativePath = "index.html"
        }

        $candidatePath = [System.IO.Path]::GetFullPath((Join-Path $serverDir $relativePath))
        $fileName = [System.IO.Path]::GetFileName($candidatePath).ToLowerInvariant()

        if (-not $candidatePath.StartsWith($serverRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            continue
        }
        if ($blockedFiles -contains $fileName) {
            Send-Response -stream $sslStream -statusCode 403 -reason "Forbidden" -body ([System.Text.Encoding]::UTF8.GetBytes("Forbidden")) -contentType "text/plain; charset=utf-8"
            continue
        }
        if (-not (Test-Path $candidatePath -PathType Leaf)) {
            Send-Response -stream $sslStream -statusCode 404 -reason "Not Found" -body ([System.Text.Encoding]::UTF8.GetBytes("Not Found")) -contentType "text/plain; charset=utf-8"
            continue
        }

        $content = [System.IO.File]::ReadAllBytes($candidatePath)
        $ext = [System.IO.Path]::GetExtension($candidatePath).ToLowerInvariant()
        $contentType = $mimeMap[$ext]
        if (-not $contentType) { $contentType = "application/octet-stream" }

        Send-Response -stream $sslStream -statusCode 200 -reason "OK" -body $content -contentType $contentType
    }
    catch {
        Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Log $_.Exception.Message
    }
    finally {
        if ($reader) { $reader.Close() }
        $sslStream.Close()
        $client.Close()
    }
}
