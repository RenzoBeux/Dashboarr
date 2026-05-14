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
// Fix: compile the fmt AND RCT-Folly pods against the C++17 language standard,
// and define FMT_USE_CONSTEVAL=0 on both. RCT-Folly includes fmt headers, so
// patching only fmt leaves Folly pulling in the consteval-marked constructor
// when it's compiled as C++20 — same error, different translation unit. The
// belt-and-suspenders FMT_USE_CONSTEVAL=0 forces FMT_CONSTEVAL to expand to
// empty even if some build path slips through with C++20. This is the exact
// verbatim snippet from software-mansion/react-native-executorch#1081, which
// is the one community-tested combination known to work end-to-end on RN 0.81
// + Xcode 26.4. Drop this plugin when RN ships a fmt version that's clean on
// Apple Clang 21 (tracked for RN 0.83 per expo#44229).
//
// The patch MUST run at the very end of the Podfile's post_install block. RN's
// own post_install (called via `react_native_post_install` or
// `react_native_post_install!`, depending on SDK shape) walks every pod target
// and resets `CLANG_CXX_LANGUAGE_STANDARD` back to its default — anything we set
// before it runs gets clobbered. Rather than rely on the exact RN function name
// or argument shape (which has changed between SDKs), we locate the
// `post_install do |installer|` block, walk forward counting `do`/`end`
// keywords to find its matching `end`, and inject our snippet immediately
// before that `end`. This makes the patch the last code that runs inside
// post_install, regardless of what came before.
const MARKER = "# fmt-consteval-fix";
const PATCH = `
  ${MARKER}
  installer.pods_project.targets.each do |target|
    if target.name == 'fmt' || target.name == 'RCT-Folly'
      target.build_configurations.each do |config|
        config.build_settings['CLANG_CXX_LANGUAGE_STANDARD'] = 'c++17'
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] ||= ['$(inherited)']
        unless config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'].include?('FMT_USE_CONSTEVAL=0')
          config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] << 'FMT_USE_CONSTEVAL=0'
        end
      end
    end
  end
`;

// Find the index of the `end` keyword that closes the `post_install do
// |installer|` block by counting do/end nesting. Returns the start index of the
// closing `end`, or -1 if not found. Word-boundaried so we don't match `do`
// inside identifiers like `do_something`.
function findPostInstallEnd(podfile) {
  const openMatch = podfile.match(/post_install\s+do\s+\|installer\|/);
  if (!openMatch) return -1;

  const startIdx = openMatch.index + openMatch[0].length;
  const tokenRe = /\b(do|end)\b/g;
  tokenRe.lastIndex = startIdx;

  let depth = 1;
  let m;
  while ((m = tokenRe.exec(podfile)) !== null) {
    depth += m[1] === "do" ? 1 : -1;
    if (depth === 0) return m.index;
  }
  return -1;
}

function withFmtConstevalFix(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) return config;

      let podfile = fs.readFileSync(podfilePath, "utf-8");
      if (podfile.includes(MARKER)) return config;

      const endIdx = findPostInstallEnd(podfile);
      if (endIdx === -1) {
        throw new Error(
          "withFmtConstevalFix: could not locate the closing `end` of `post_install do |installer|` in Podfile",
        );
      }

      const updated = podfile.slice(0, endIdx) + PATCH + "\n" + podfile.slice(endIdx);
      fs.writeFileSync(podfilePath, updated);
      return config;
    },
  ]);
}

module.exports = withFmtConstevalFix;
