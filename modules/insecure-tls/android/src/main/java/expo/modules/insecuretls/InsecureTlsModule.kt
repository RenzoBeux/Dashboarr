package expo.modules.insecuretls

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class InsecureTlsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InsecureTls")

    // Backstop install — the primary install runs from MainApplication.onCreate
    // (plugins/withInsecureTls.js) so the OkHttp factory is in place before
    // NetworkingModule constructs its client. Idempotent: setOkHttpClientFactory
    // just swaps the static factory reference.
    OnCreate {
      InsecureTlsClientFactory.install()
    }

    Function("setInsecureHosts") { hosts: List<String> ->
      InsecureHostStore.setHosts(hosts)
    }
  }
}
