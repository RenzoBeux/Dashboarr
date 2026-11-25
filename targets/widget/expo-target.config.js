// iOS Home Screen + Lock Screen "Releasing Soon" widget (#477), linked into the
// prebuilt Xcode project by @bacons/apple-targets. The app writes a snapshot of
// the agenda into the App Group (widgets/ios-widget.ts) and this extension only
// renders it: no credentials, no requests to Sonarr/Radarr.

/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "DashboarrWidget",
  displayName: "Dashboarr",
  // com.dashboarr.app(.dev).widget. ReleasingSoonStore derives the App Group
  // from this suffix, so keep them in step.
  bundleIdentifier: ".widget",
  // containerBackground and the Lock Screen families without availability
  // checks. Older iOS versions simply don't offer the widget.
  deploymentTarget: "17.0",
  icon: "../../assets/icon.png",
  colors: {
    $accent: "#3b82f6",
    // Mirrors the app chrome: zinc-950 in dark, the Light theme's background
    // in light (lib/app-themes.ts).
    widgetSurface: { light: "#f4f4f5", dark: "#09090b" },
  },
  entitlements: {
    "com.apple.security.application-groups":
      config.ios.entitlements["com.apple.security.application-groups"],
  },
});
