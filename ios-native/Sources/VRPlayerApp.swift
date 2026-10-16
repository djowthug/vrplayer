import SwiftUI
import UIKit

public class AppDelegate: NSObject, UIApplicationDelegate {
    public static var orientationLock: UIInterfaceOrientationMask = .allButUpsideDown

    public func application(_ application: UIApplication, supportedInterfaceOrientationsFor window: UIWindow?) -> UIInterfaceOrientationMask {
        return AppDelegate.orientationLock
    }
}

@main
struct VRPlayerApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    
    var body: some Scene {
        WindowGroup {
            GalleryView()
                .preferredColorScheme(.dark)
        }
    }
}
