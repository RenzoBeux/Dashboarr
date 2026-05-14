const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// React Native 0.81 pins fmt 11.0.2 (node_modules/react-native/third-party-podspecs/fmt.podspec).
// Apple Clang 21 (Xcode 26.4+) tightened C++20 consteval enforcement, breaking
// fmt 11.0.2's FMT_STRING(...) macro and producing five "call to consteval
// function ... is not a constant expression" errors when compiling
// Pods/fmt/src/format.cc. This blocks every iOS archive on freshly rebuilt
// Codemagic / EAS macOS images until React Native ships a newer fmt — tracked
// upstream in react-native#55601 and expo#44229. Maintainers say the fmt bump
// will land in RN 0.83.
//
// Fix: compile the fmt pod (and only the fmt pod) against the C++17 language
// standard. fmt's own header (base.h) gates consteval on FMT_HAS_FEATURE(
// cxx_consteval) — under C++17 that feature isn't advertised, so FMT_CONSTEVAL
// collapses to empty and the buggy code path is never instantiated. This is
// the canonical workaround published by the fmt maintainers and adopted across
// the React Native community. It changes only the fmt pod; the rest of the
// project stays on its configured C++ standard. Drop this plugin when RN ships
// a fmt version that's clean on Apple Clang 21.
//
// A previous version of this plugin tried -DFMT_USE_CONSTEVAL=0 via
// GCC_PREPROCESSOR_DEFINITIONS. The flag arrived on the fmt compile command but
// the constructor still resolved as consteval (very likely because Clang's
// modules cache reused header PCMs parsed without the define). Switching the
// language standard sidesteps the cache entirely — different std, different
// module hash.
const MARKER = "# fmt-consteval-fix";
const PATCH = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
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
