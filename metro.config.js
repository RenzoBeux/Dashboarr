const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

// inlineRem: false — keep `rem` values as runtime descriptors instead of
// statically multiplying by 14 at compile time. This is what makes the
// UI Scale (accessibility) feature actually work: every rem-based class
// (text-sm, p-4, w-14, gap-3, etc.) re-resolves against the live rem value
// when `rem.set(...)` is called from UiScaleBridge in app/_layout.tsx.
// With the default inlineRem=14, those classes get baked to fixed pixels
// at bundle time and no setting can scale them.
module.exports = withNativeWind(config, {
  input: "./global.css",
  inlineRem: false,
});
