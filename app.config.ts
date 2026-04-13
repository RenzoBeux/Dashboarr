import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Dashboarr",
  "owner": "dashboarr",
  slug: "dashboarr",
  version: "1.0.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#09090b",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.dashboarr.app",
    infoPlist: {
      NSLocalNetworkUsageDescription:
        "Dashboarr sends Wake-on-LAN magic packets to your home server on the local network.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#09090b",
    },
    package: "com.dashboarr.app",
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
