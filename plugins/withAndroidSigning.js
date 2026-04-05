const { withAppBuildGradle } = require("expo/config-plugins");

/**
 * Config plugin that injects release signing config into android/app/build.gradle.
 * The keystore file must exist at android/app/dashboarr-release.keystore.
 * Copy it from ~/.android-keystores/dashboarr-release.keystore or Bitwarden after prebuild.
 */
function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Skip if already configured
    if (buildGradle.includes("signingConfigs.release")) {
      return config;
    }

    // Add release signing config after debug signing config
    buildGradle = buildGradle.replace(
      /signingConfigs\s*\{[^}]*debug\s*\{[^}]*\}\s*\}/s,
      (match) =>
        match.replace(
          /\}(\s*)\}$/,
          `}\n        release {\n            storeFile file('dashboarr-release.keystore')\n            storePassword 'dashboarr2024'\n            keyAlias 'dashboarr'\n            keyPassword 'dashboarr2024'\n        }$1}`
        )
    );

    // Point release buildType to release signing config
    // Match inside: release { ... signingConfig signingConfigs.debug
    buildGradle = buildGradle.replace(
      /(buildTypes\s*\{[^]*?release\s*\{[^]*?signingConfig\s+)signingConfigs\.debug/s,
      "$1signingConfigs.release"
    );

    config.modResults.contents = buildGradle;
    return config;
  });
}

module.exports = withAndroidSigning;
