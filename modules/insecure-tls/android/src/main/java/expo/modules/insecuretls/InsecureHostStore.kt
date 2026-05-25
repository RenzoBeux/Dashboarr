package expo.modules.insecuretls

import java.util.concurrent.atomic.AtomicReference

/**
 * Holds the set of hostnames the user opted into "ignore TLS certificate
 * errors" for. Written from the JS thread via the module's `setInsecureHosts`,
 * read from OkHttp's connection threads inside [HostAwareSSLSocketFactory] and
 * the hostname verifier. An [AtomicReference] to an immutable set gives a
 * lock-free read/replace.
 */
object InsecureHostStore {
  private val hosts = AtomicReference<Set<String>>(emptySet())

  fun setHosts(list: List<String>) {
    hosts.set(list.map { it.lowercase() }.toSet())
  }

  fun isInsecure(host: String?): Boolean {
    if (host.isNullOrEmpty()) return false
    return hosts.get().contains(host.lowercase())
  }
}
