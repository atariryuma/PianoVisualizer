import UIKit

// Apps built with the iOS 27 SDK do not launch without the UIScene life cycle
// (TN3187). UIKit creates the window from UISceneStoryboardFile in Info.plist and
// assigns it here. Capacitor and its plugins observe UIApplication notifications,
// which UIKit still posts, so there is nothing to forward.
//
// With scenes, UIKit stops calling the AppDelegate's URL and user-activity
// methods. The app registers no URL scheme or universal link today. If one is
// added, forward scene(_:openURLContexts:) and scene(_:continue:) from here to
// ApplicationDelegateProxy.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?
}
