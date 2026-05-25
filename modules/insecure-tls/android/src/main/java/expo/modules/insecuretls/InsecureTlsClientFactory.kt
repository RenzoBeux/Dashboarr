package expo.modules.insecuretls

import com.facebook.react.modules.network.OkHttpClientFactory
import com.facebook.react.modules.network.OkHttpClientProvider
import okhttp3.OkHttpClient
import java.net.InetAddress
import java.net.Socket
import java.security.KeyStore
import java.security.SecureRandom
import java.security.cert.X509Certificate
import javax.net.ssl.HostnameVerifier
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

/**
 * Supplies React Native's networking stack with an OkHttpClient that skips TLS
 * trust evaluation for hosts in [InsecureHostStore] — and only those hosts.
 *
 * Per-host (not global) is the whole point: OkHttp passes the target host to
 * `SSLSocketFactory.createSocket(...)`, so [HostAwareSSLSocketFactory] can hand
 * back a trust-all socket for an allowlisted host and a fully-validating one
 * for everything else. Hostname verification is bypassed for the same hosts so
 * a self-signed cert whose CN/SAN doesn't match still connects.
 *
 * Installed from MainApplication.onCreate (see plugins/withInsecureTls.js) so
 * the factory is set before RN's NetworkingModule builds its client — and again
 * from the module's OnCreate as a backstop.
 */
class InsecureTlsClientFactory : OkHttpClientFactory {
  override fun createNewNetworkModuleClient(): OkHttpClient {
    val socketFactory = HostAwareSSLSocketFactory(systemDefaultTrustManager())
    // OkHttp's default hostname verifier, captured so non-allowlisted hosts
    // keep normal verification.
    val defaultVerifier = OkHttpClient().hostnameVerifier
    val verifier = HostnameVerifier { hostname, session ->
      if (InsecureHostStore.isInsecure(hostname)) true
      else defaultVerifier.verify(hostname, session)
    }
    return OkHttpClientProvider.createClientBuilder()
      // The trust manager passed here only feeds OkHttp's certificate-chain
      // cleaner (used by CertificatePinner, which we don't configure). Actual
      // handshake trust is governed per-host by `socketFactory`.
      .sslSocketFactory(socketFactory, TRUST_ALL)
      .hostnameVerifier(verifier)
      .build()
  }

  companion object {
    private val TRUST_ALL = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
      override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

    @JvmStatic
    fun install() {
      OkHttpClientProvider.setOkHttpClientFactory(InsecureTlsClientFactory())
    }

    private fun systemDefaultTrustManager(): X509TrustManager {
      val tmf =
        TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm())
      tmf.init(null as KeyStore?)
      return tmf.trustManagers.first { it is X509TrustManager } as X509TrustManager
    }
  }
}

/**
 * Branches per target host: a trust-all SSLContext for allowlisted hosts, the
 * platform default otherwise. The host arrives via the `createSocket` overloads
 * OkHttp calls, so the decision is made fresh for every connection.
 */
private class HostAwareSSLSocketFactory(
  defaultTrustManager: X509TrustManager,
) : SSLSocketFactory() {
  private val defaultFactory: SSLSocketFactory =
    SSLContext.getInstance("TLS").apply {
      init(null, arrayOf<TrustManager>(defaultTrustManager), SecureRandom())
    }.socketFactory

  private val trustAllFactory: SSLSocketFactory =
    SSLContext.getInstance("TLS").apply {
      init(null, arrayOf<TrustManager>(TRUST_ALL), SecureRandom())
    }.socketFactory

  private fun factoryFor(host: String?): SSLSocketFactory =
    if (InsecureHostStore.isInsecure(host)) trustAllFactory else defaultFactory

  override fun getDefaultCipherSuites(): Array<String> = defaultFactory.defaultCipherSuites

  override fun getSupportedCipherSuites(): Array<String> = defaultFactory.supportedCipherSuites

  // The overload OkHttp uses to upgrade a connected socket to TLS — `host` is
  // the request's target hostname.
  override fun createSocket(s: Socket, host: String, port: Int, autoClose: Boolean): Socket =
    factoryFor(host).createSocket(s, host, port, autoClose)

  override fun createSocket(host: String, port: Int): Socket =
    factoryFor(host).createSocket(host, port)

  override fun createSocket(
    host: String,
    port: Int,
    localHost: InetAddress,
    localPort: Int,
  ): Socket = factoryFor(host).createSocket(host, port, localHost, localPort)

  override fun createSocket(host: InetAddress, port: Int): Socket =
    factoryFor(host.hostName).createSocket(host, port)

  override fun createSocket(
    address: InetAddress,
    port: Int,
    localAddress: InetAddress,
    localPort: Int,
  ): Socket = factoryFor(address.hostName).createSocket(address, port, localAddress, localPort)

  // OkHttp doesn't use the no-arg path; default to the validating factory.
  override fun createSocket(): Socket = defaultFactory.createSocket()

  private companion object {
    val TRUST_ALL = object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
      override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {}
      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }
  }
}
