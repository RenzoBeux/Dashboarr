import { ExpoConfig, ConfigContext } from "expo/config";

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Dashboarr",
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
  ],
});
