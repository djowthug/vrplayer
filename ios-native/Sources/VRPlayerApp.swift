import SwiftUI

@main
struct VRPlayerApp: App {
    var body: some Scene {
        WindowGroup {
            GalleryView()
                .preferredColorScheme(.dark)
        }
    }
}
