const { withMainApplication } = require("expo/config-plugins");

// Installs the per-host TLS-bypass OkHttp factory (from the local
// `insecure-tls` Expo module) into MainApplication.onCreate.
//
// Why here and not just the module's OnCreate: React Native's NetworkingModule
// builds its OkHttpClient via OkHttpClientProvider.createClient() the first
// time JS makes a request, and that snapshots whatever factory is set at that
// moment — OkHttpClientProvider does NOT rebuild the client when the factory
// changes later. Setting the factory in Application.onCreate (which runs at
// process start, before any JS) guarantees it's in place first. The factory
// itself reads the allowlist lazily per-connection, so installing it early
// with an empty allowlist is fine — `setInsecureHosts` fills it in later.
const IMPORT_LINE = "import expo.modules.insecuretls.InsecureTlsClientFactory";
const INSTALL_CALL = "InsecureTlsClientFactory.install()";

function withInsecureTls(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes(INSTALL_CALL)) {
      return config; // already patched
    }

    // Add the import after the package declaration.
    if (!contents.includes(IMPORT_LINE)) {
      contents = contents.replace(
        /^(package .+\n)/m,
        `$1\n${IMPORT_LINE}\n`,
      );
    }

    // Install the factory as the first thing after super.onCreate(), before
    // loadReactNative(...) wires up the networking module.
    const onCreateAnchor = "super.onCreate()";
    if (!contents.includes(onCreateAnchor)) {
      throw new Error(
        "withInsecureTls: could not find `super.onCreate()` in MainApplication",
      );
    }
    contents = contents.replace(
      onCreateAnchor,
      `${onCreateAnchor}\n    ${INSTALL_CALL}`,
    );

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withInsecureTls;
