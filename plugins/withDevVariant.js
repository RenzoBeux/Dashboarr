const { withAppBuildGradle, withStringsXml } = require("expo/config-plugins");

/**
 * Config plugin that wires the development variant into the Android project:
 *
 *  - applicationIdSuffix ".dev"  when APP_VARIANT=development, so dev installs as
 *    com.dashboarr.app.dev and coexists side-by-side with the prod build.
 *  - resValue app_name "Dashboarr Dev" / "Dashboarr" so the launcher icon labels
 *    are visually distinguishable. The matching app_name entry in
 *    strings.xml is removed to avoid a duplicate-resource error.
 *  - Skips the com.google.gms.google-services plugin in dev, since
 *    google-services.json only has a client for the prod package and FCM in dev
 *    isn't worth a second Firebase registration. Push is no-op in dev;
 *    lib/expo-push.ts already swallows the failure.
 *
 * The Gradle env-var conditional means the SAME prebuilt android/ project can
 * produce both variants by toggling APP_VARIANT at gradlew invocation time —
 * no second prebuild needed when switching.
 */

const VARIANT_MARKER = "applicationIdSuffix \".dev\"";

function injectVariantBlock(buildGradle) {
  if (buildGradle.includes(VARIANT_MARKER)) return buildGradle;

  // Append the variant switch at the end of defaultConfig (anchored on the
  // closing brace of the buildConfigField line we know is present).
  buildGradle = buildGradle.replace(
    /(buildConfigField\s+"String",\s+"REACT_NATIVE_RELEASE_LEVEL"[^\n]*\n)/,
    `$1
        if (System.getenv("APP_VARIANT") == "development") {
            applicationIdSuffix ".dev"
            resValue "string", "app_name", "Dashboarr Dev"
        } else {
            resValue "string", "app_name", "Dashboarr"
        }
`
  );

  // Wrap the google-services plugin application so dev builds don't fail when
  // there's no matching client entry for com.dashboarr.app.dev.
  buildGradle = buildGradle.replace(
    /^apply plugin: 'com\.google\.gms\.google-services'\s*$/m,
    `if (System.getenv("APP_VARIANT") != "development") {\n    apply plugin: 'com.google.gms.google-services'\n}`
  );

  return buildGradle;
}

function withDevVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = injectVariantBlock(cfg.modResults.contents);
    return cfg;
  });

  config = withStringsXml(config, (cfg) => {
    const strings = cfg.modResults?.resources?.string ?? [];
    cfg.modResults.resources.string = strings.filter(
      (entry) => entry?.$?.name !== "app_name"
    );
    return cfg;
  });

  return config;
}

module.exports = withDevVariant;
