import Cocoa

// MARK: - Application Entry Point
let app = NSApplication.shared
let delegate = TakeFiveMenuBarApp()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
