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
    "@react-native-community/netinfo",
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Allow Dashboarr to detect your WiFi network name for automatic local/remote URL switching.",
      },
    ],
  ],
});
