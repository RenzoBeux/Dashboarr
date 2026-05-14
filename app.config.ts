import { ExpoConfig, ConfigContext } from "expo/config";
import pkg from "./package.json";

// Derives a monotonic integer from semver so `pnpm bump:*` propagates to the
// native build identifiers Google Play / App Store require. 1.2.3 → 10203.
const [major, minor, patch] = pkg.version.split(".").map((n) => parseInt(n, 10));
const nativeBuildNumber = major * 10000 + minor * 100 + patch;

// APP_VARIANT=development produces a side-by-side install: different name,
// bundle id, package, and URL scheme so both prod and dev builds can coexist
// on the same device. Slug and EAS project stay shared so OTA channels still
// route correctly (dev binaries pull the "development" channel via eas.json).
const IS_DEV = process.env.APP_VARIANT === "development";
const APP_NAME = IS_DEV ? "Dashboarr Dev" : "Dashboarr";
const BUNDLE_ID = IS_DEV ? "com.dashboarr.app.dev" : "com.dashboarr.app";
const APP_SCHEME = IS_DEV ? "dashboarr-dev" : "dashboarr";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: APP_NAME,
  "owner": "dashboarr",
  slug: "dashboarr",
  version: pkg.version,
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash.png",
    resizeMode: "cover",
    backgroundColor: "#09090b",
  },
  // EAS Update — OTA JS/asset updates shipped via `eas update --branch <channel>`.
  // Binary and update must share the same runtimeVersion; bumping the native
  // `version` (or adding any native code) cuts a new runtime and requires a
  // fresh TestFlight / Play Store build.
  updates: {
    url: "https://u.expo.dev/2e40d2d5-f7c5-4c28-922c-40e2a5ab2a8c",
    requestHeaders: {
      "expo-channel-name": process.env.EAS_UPDATE_CHANNEL ?? "production",
    },
  },
  runtimeVersion: {
    policy: "fingerprint",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: BUNDLE_ID,
    buildNumber: String(nativeBuildNumber),
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocalNetworkUsageDescription:
        "Dashboarr sends Wake-on-LAN magic packets to your home server on the local network.",
      // Self-hosted services on a LAN almost always speak plain http://, and
      // iOS blocks cleartext by default (App Transport Security). Mirrors the
      // Android cleartext-traffic plugin. The remote-URL form already warns
      // when users pick http:// for an internet-facing endpoint.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
    // Required so NetInfo can read the current Wi-Fi SSID/BSSID for the
    // local-vs-remote auto-switch feature. iOS also needs Location When-In-Use
    // permission at runtime (handled in lib/wifi.ts via expo-location).
    entitlements: {
      "com.apple.developer.networking.wifi-info": true,
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#09090b",
    },
    // Always the base id at prebuild time. The dev variant suffix (".dev") is
    // applied at Gradle build time by plugins/withDevVariant — that lets one
    // prebuilt android/ project produce both variants by toggling APP_VARIANT
    // when invoking gradlew, without a second prebuild.
    package: "com.dashboarr.app",
    versionCode: nativeBuildNumber,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
  scheme: APP_SCHEME,
  // Shared EAS project used by every install. Required for real push tokens —
  // Notifications.getExpoPushTokenAsync({ projectId }) reads from extra.eas.projectId.
  // Keep this stable across releases; replace with the real EAS project UUID
  // from `eas init`. Must NOT have Enhanced Security for Push Notifications
  // enabled on the Expo side (see backend README).
  extra: {
    eas: {
      "projectId": "2e40d2d5-f7c5-4c28-922c-40e2a5ab2a8c"
    },
  },
  plugins: [
    "expo-router",
    "expo-secure-store",
    "./plugins/withAndroidSigning",
    "./plugins/withCleartextTraffic",
    "./plugins/withDevVariant",
    "./plugins/withFmtConstevalFix",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow Dashboarr to detect your WiFi network name for automatic local/remote URL switching.",
      },
    ],
    [
      "expo-notifications",
      {
        color: "#3b82f6",
      },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow Dashboarr to scan your backend pairing QR code.",
      },
    ],
  ],
});
