const { withAppBuildGradle } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Config plugin that injects release signing config into android/app/build.gradle.
 * Reads keystore credentials from .env file at project root.
 * The keystore file must exist at android/app/dashboarr-release.keystore after prebuild.
 */

function loadEnv() {
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const match = line.match(/^\s*([\w]+)\s*=\s*(.+?)\s*$/);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

function withAndroidSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Skip if already configured
    if (buildGradle.includes("signingConfigs.release")) {
      return config;
    }

    const env = loadEnv();
    const storeFile = env.KEYSTORE_PATH || "dashboarr-release.keystore";
    const storePassword = env.KEYSTORE_PASSWORD || "";
    const keyAlias = env.KEYSTORE_ALIAS || "dashboarr";
    const keyPassword = env.KEY_PASSWORD || "";

    // Add release signing config after debug signing config
    buildGradle = buildGradle.replace(
      /signingConfigs\s*\{[^}]*debug\s*\{[^}]*\}\s*\}/s,
      (match) =>
        match.replace(
          /\}(\s*)\}$/,
          `}\n        release {\n            storeFile file('${storeFile}')\n            storePassword '${storePassword}'\n            keyAlias '${keyAlias}'\n            keyPassword '${keyPassword}'\n        }$1}`
        )
    );

    // Point release buildType to release signing config
    buildGradle = buildGradle.replace(
      /(buildTypes\s*\{[^]*?release\s*\{[^]*?signingConfig\s+)signingConfigs\.debug/s,
      "$1signingConfigs.release"
    );

    config.modResults.contents = buildGradle;
    return config;
  });
}

module.exports = withAndroidSigning;
