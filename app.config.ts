import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Dashboarr",
  "owner": "dashboarr",
  slug: "dashboarr",
  version: "1.2.0",
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
    policy: "appVersion",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.dashboarr.app",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      NSLocalNetworkUsageDescription:
        "Dashboarr sends Wake-on-LAN magic packets to your home server on the local network.",
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
    package: "com.dashboarr.app",
    versionCode: 4,
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? "./google-services.json",
  },
  scheme: "dashboarr",
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
