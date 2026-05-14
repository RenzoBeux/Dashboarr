const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// React Native 0.81 pins fmt 11.0.2 (node_modules/react-native/third-party-podspecs/fmt.podspec).
// Under certain Clang frontend states shipped with Xcode 26.4.x images, fmt's
// FMT_STRING(...) macro fails to evaluate as a constant expression in consteval
// mode, killing the iOS build at Pods/fmt/src/format.cc. Forcing the compile-time
// definition FMT_USE_CONSTEVAL=0 makes fmt fall back to constexpr (the same path
// older Clangs took) without changing runtime behavior. This patch reproduces
// what people do by hand in node_modules/react-native/third-party-podspecs/fmt.podspec.
const MARKER = "# fmt-consteval-fix";
const PATCH = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FMT_USE_CONSTEVAL=0')
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        end
      end
    end
  end
`;

function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) return config;

      let podfile = fs.readFileSync(podfilePath, "utf-8");
      if (podfile.includes(MARKER)) return config;

      const updated = podfile.replace(
        /(post_install\s+do\s+\|installer\|\s*\n)/,
        `$1${PATCH}\n`,
      );

      if (updated === podfile) {
        throw new Error(
          "withFmtConstevalFix: could not find `post_install do |installer|` in Podfile — Expo prebuild output changed shape?",
        );
      }

      fs.writeFileSync(podfilePath, updated);
      return config;
    },
  ]);
}

module.exports = withFmtConstevalFix;
