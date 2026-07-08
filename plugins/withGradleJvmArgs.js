const { withGradleProperties } = require("expo/config-plugins");

// lintVitalReportRelease loads classes for every dependency (AndroidX, Compose,
// RN autolinked libs) into the Gradle daemon's Metaspace. The Expo template's
// default -XX:MaxMetaspaceSize is too small for this project's dependency count
// and OOMs mid-build with a bare "Metaspace" failure (no stack trace).
function withGradleJvmArgs(config) {
  return withGradleProperties(config, (config) => {
    const jvmArgsProp = config.modResults.find(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs"
    );
    if (jvmArgsProp) {
      jvmArgsProp.value = "-Xmx4096m -XX:MaxMetaspaceSize=1024m";
    }
    return config;
  });
}

module.exports = withGradleJvmArgs;
