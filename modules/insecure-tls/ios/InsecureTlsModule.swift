import ExpoModulesCore
import ObjectiveC.runtime

// MARK: - Allowlist store

// Holds the set of hostnames the user opted into "ignore TLS certificate
// errors" for. Written from the JS thread via `setInsecureHosts`, read from
// NSURLSession's delegate queue inside the swizzled challenge handler — hence
// the lock.
final class InsecureTlsHostStore {
  static let shared = InsecureTlsHostStore()
  private let lock = NSLock()
  private var hosts = Set<String>()

  func set(_ newHosts: [String]) {
    let normalized = Set(newHosts.map { $0.lowercased() })
    lock.lock()
    hosts = normalized
    lock.unlock()
  }

  func contains(_ host: String) -> Bool {
    let key = host.lowercased()
    lock.lock()
    defer { lock.unlock() }
    return hosts.contains(key)
  }
}

// MARK: - Swizzle

// Block IMP for `-URLSession:didReceiveChallenge:completionHandler:`. Blocks
// installed via `imp_implementationWithBlock` receive `self` as the first arg
// and omit `_cmd`, so using `Any` for the receiver sidesteps the Swift
// self-type mismatch you'd hit feeding a Swift instance method's IMP onto a
// different class.
private typealias ChallengeBlock = @convention(block) (
  Any,
  URLSession,
  URLAuthenticationChallenge,
  @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
) -> Void

// C-function shape of the original IMP, used to chain to RN's implementation
// if it already had one (includes the `_cmd` selector arg).
private typealias ChallengeIMP = @convention(c) (
  Any,
  Selector,
  URLSession,
  URLAuthenticationChallenge,
  @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
) -> Void

// Used only to read the canonical Objective-C type encoding for the method we
// add — more robust than hardcoding "v@:@@@?".
private final class InsecureTlsSignatureProvider: NSObject {
  @objc(URLSession:didReceiveChallenge:completionHandler:)
  func urlSession(
    _ session: URLSession,
    didReceive challenge: URLAuthenticationChallenge,
    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
  ) {}
}

enum InsecureTlsSwizzler {
  private static var installed = false
  private static var originalIMP: IMP?
  private static let selector = NSSelectorFromString(
    "URLSession:didReceiveChallenge:completionHandler:"
  )

  // Installs an auth-challenge handler on RN's HTTP request handler class so
  // server-trust challenges for allowlisted hosts are accepted. React Native's
  // `fetch`/XHR all flow through RCTHTTPRequestHandler, so this covers every
  // request the app makes via the JS networking stack. Idempotent.
  static func installIfNeeded() {
    guard !installed else { return }
    installed = true

    guard let cls = NSClassFromString("RCTHTTPRequestHandler") else {
      // New-architecture or future RN rename — without the class there's
      // nothing to patch; secure default behavior remains in force.
      return
    }

    let block: ChallengeBlock = { receiver, session, challenge, completionHandler in
      let space = challenge.protectionSpace
      if space.authenticationMethod == NSURLAuthenticationMethodServerTrust,
        let trust = space.serverTrust,
        InsecureTlsHostStore.shared.contains(space.host)
      {
        completionHandler(.useCredential, URLCredential(trust: trust))
        return
      }
      // Not an allowlisted host (or not a server-trust challenge): preserve
      // RN's original behavior when it had one, otherwise let the system
      // perform its normal validation — which rejects untrusted certs.
      if let original = originalIMP {
        let fn = unsafeBitCast(original, to: ChallengeIMP.self)
        fn(receiver, selector, session, challenge, completionHandler)
      } else {
        completionHandler(.performDefaultHandling, nil)
      }
    }
    let newIMP = imp_implementationWithBlock(block)

    if let existing = class_getInstanceMethod(cls, selector) {
      // RN already handles the challenge — swap implementations so our handler
      // runs first and can chain to the original for non-allowlisted hosts.
      originalIMP = method_setImplementation(existing, newIMP)
    } else {
      // RN leaves server-trust to the default handler — add ours as the
      // session-level handler so NSURLSession routes trust challenges to it.
      let types =
        method_getTypeEncoding(
          class_getInstanceMethod(InsecureTlsSignatureProvider.self, selector)!
        )
      class_addMethod(cls, selector, newIMP, types)
    }
  }
}

// MARK: - Expo module

public class InsecureTlsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("InsecureTls")

    // Runs during module registration at app start — before the JS bundle
    // issues any network request, so the handler is in place by first fetch.
    OnCreate {
      InsecureTlsSwizzler.installIfNeeded()
    }

    Function("setInsecureHosts") { (hosts: [String]) in
      InsecureTlsHostStore.shared.set(hosts)
    }
  }
}
