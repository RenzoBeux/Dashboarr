const { withAndroidManifest } = require("expo/config-plugins");

// Self-hosted services on a LAN almost always speak plain http://, and Android 9+
// blocks cleartext by default. Without this, release builds silently fail every
// LAN request — debug builds happen to work because the debug manifest already
// has usesCleartextTraffic=true. The remote-URL form already warns when users
// pick http:// for an internet-facing endpoint, so opting in globally is the
// pragmatic call here.
function withCleartextTraffic(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application?.$) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return config;
  });
}

module.exports = withCleartextTraffic;
