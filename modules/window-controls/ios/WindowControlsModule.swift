import ExpoModulesCore
import UIKit

public class WindowControlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WindowControls")

    // Horizontal space (pt, measured from each window edge) that content near
    // the top of the window must leave clear of the iPadOS 26 window-control
    // cluster (close/minimize/expand, issue #342). Zero whenever the cluster
    // doesn't overlap content: iPhone, fullscreen iPad, iOS < 26.
    AsyncFunction("getTopCornerInsets") { () -> [String: Double] in
      Self.measureTopCornerInsets()
    }.runOnQueue(.main)
  }

  private static func measureTopCornerInsets() -> [String: Double] {
    // The corner-adaptation layout API ships with the iOS 26 SDK (Xcode 26 /
    // Swift 6.2); older toolchains build the zero-inset stub.
    #if compiler(>=6.2)
    guard #available(iOS 26.0, *), let window = keyWindow() else {
      return ["left": 0, "right": 0]
    }

    // Corner-adapted margins are position-dependent: only views whose frame
    // reaches into the window's top corners get adapted, so a probe is laid
    // over the top strip of the window where the app renders its headers.
    let probe = UIView(frame: CGRect(x: 0, y: 0, width: window.bounds.width, height: 120))
    probe.alpha = 0
    probe.isUserInteractionEnabled = false
    probe.isAccessibilityElement = false
    window.addSubview(probe)
    defer { probe.removeFromSuperview() }

    window.setNeedsUpdateProperties()
    probe.setNeedsUpdateProperties()
    window.updatePropertiesIfNeeded()
    probe.updatePropertiesIfNeeded()

    let adapted = probe.edgeInsets(for: .margins(cornerAdaptation: .horizontal))
    let baseline = probe.edgeInsets(for: .margins(cornerAdaptation: .none))

    // An edge whose adapted margin equals the baseline margin needs no
    // clearance; only a corner-adapted edge reports its full margin.
    return [
      "left": adapted.left == baseline.left ? 0 : Double(adapted.left),
      "right": adapted.right == baseline.right ? 0 : Double(adapted.right),
    ]
    #else
    return ["left": 0, "right": 0]
    #endif
  }

  private static func keyWindow() -> UIWindow? {
    UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .flatMap { $0.windows }
      .first { $0.isKeyWindow }
  }
}
