const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

// Xcode 27 dropped support for deployment targets below iOS 15.0: a target set
// lower is now a hard build error, not a warning ("the range of supported
// deployment target versions is 15.0 to 27.0.x").
//
// React Native's own post_install already raises pods to the minimum it
// supports — but only their *native* targets. `updateOSDeploymentTarget` in
// react-native/scripts/cocoapods/utils.rb walks
// `pod_target_installation_results` and touches `native_target` alone, so the
// resource-bundle targets CocoaPods generates alongside them keep whatever
// their podspec declared. Those are the four that fail the archive here:
//   RNSVG-RNSVGFilters (12.4), RNCAsyncStorage-RNCAsyncStorage_resources (13.4),
//   SDWebImage-SDWebImage (9.0), ReachabilitySwift-ReachabilitySwift (12.0).
// Every other target in the Pods project is already at 15.1.
//
// Fix: after the Pods project is generated, raise every build configuration in
// it to the Podfile's iOS platform floor. `installer.pods_project.targets`
// covers resource bundles and aggregates too, which is exactly what RN's pass
// misses. Taking the max means a pod that legitimately requires a *newer* iOS
// than the app keeps its own value. Drop this plugin once RN bumps resource
// bundle targets itself.
const MARKER = "# pods-deployment-target";
const PATCH = `
  ${MARKER}
  pods_min_ios = podfile_properties['ios.deploymentTarget'] || '15.1'
  installer.pods_project.targets.each do |pods_target|
    pods_target.build_configurations.each do |pods_config|
      current = pods_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f
      pods_config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = [current, pods_min_ios.to_f].max.to_s
    end
  end
`;

// Injected at the *top* of post_install, right after `post_install do
// |installer|`, rather than at the end like plugins/withFmtConstevalFix.js.
// That plugin finds its insertion point by counting `do`/`end` keywords, which
// only balances on a pristine Podfile — its own snippet closes an `if` and an
// `unless`, so a second end-seeking patch would land in the middle of it. An
// anchor on the opening line needs no counting and can't drift. Nothing in
// `react_native_post_install` lowers a deployment target (it only ever raises
// one, and never looks at resource bundles), so running before it is safe.
//
// The snippet is deliberately written with no `if`/`unless` — its `do` and
// `end` keywords balance, so withFmtConstevalFix's counter still finds the real
// end of post_install no matter which of the two plugins runs first.
const ANCHOR_RE = /post_install\s+do\s+\|installer\|/;

function withPodsDeploymentTarget(config) {
  return withDangerousMod(config, [
    "ios",
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, "Podfile");
      if (!fs.existsSync(podfilePath)) return config;

      const podfile = fs.readFileSync(podfilePath, "utf-8");
      if (podfile.includes(MARKER)) return config;

      const anchor = podfile.match(ANCHOR_RE);
      if (!anchor) {
        throw new Error(
          "withPodsDeploymentTarget: could not locate `post_install do |installer|` in Podfile",
        );
      }

      const insertAt = anchor.index + anchor[0].length;
      fs.writeFileSync(podfilePath, podfile.slice(0, insertAt) + PATCH + podfile.slice(insertAt));
      return config;
    },
  ]);
}

module.exports = withPodsDeploymentTarget;
