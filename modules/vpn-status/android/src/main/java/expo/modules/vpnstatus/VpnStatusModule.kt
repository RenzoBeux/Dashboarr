package expo.modules.vpnstatus

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Reports whether the active network runs through a VPN tunnel. NetInfo can't
// tell us this: it checks TRANSPORT_VPN only after the underlying
// wifi/cellular transport (which Android merges into the VPN network's
// capabilities), so a VPN over WiFi/cellular reports as plain wifi/cellular.
class VpnStatusModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("VpnStatus")

    Function("isVpnActive") {
      val context = appContext.reactContext ?: return@Function false
      val connectivityManager =
        context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
          ?: return@Function false
      val network = connectivityManager.activeNetwork ?: return@Function false
      val capabilities =
        connectivityManager.getNetworkCapabilities(network) ?: return@Function false
      capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
    }
  }
}
