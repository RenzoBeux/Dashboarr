import { useEffect, useRef } from "react";
import { Alert, Linking, Platform } from "react-native";
import { NATIVE_VERSION, checkStoreVersion } from "@/lib/app-version";
import { getString, setString } from "@/store/storage";

const KEY_LAST_CHECKED = "app-update.last-checked-at";
const KEY_DISMISSED_VERSION = "app-update.dismissed-version";
// Throttle the auto-check to once per day so we don't hammer the store on
// every cold start.
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
// Defer the network call so it doesn't compete with the cold-start work that
// actually matters (rendering, hydration, query refetches).
const STARTUP_DELAY_MS = 4000;

/**
 * Once per day, on cold start, asks the relevant store (App Store on iOS,
 * Play Store on Android) what version is published, and prompts the user
 * if a newer version exists. Skipped in development. Users can dismiss a
 * specific version with "Skip this version" so we don't nag on every check.
 */
export function useAppUpdateCheck() {
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (__DEV__) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    const lastCheckedRaw = getString(KEY_LAST_CHECKED);
    const lastChecked = lastCheckedRaw ? Number(lastCheckedRaw) || 0 : 0;
    const now = Date.now();
    if (now - lastChecked < CHECK_INTERVAL_MS) return;

    const timer = setTimeout(() => {
      void runUpdateCheck();
    }, STARTUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);
}

async function runUpdateCheck(): Promise<void> {
  try {
    const result = await checkStoreVersion();
    // Stamp the check time even on "unknown" so a transient store fetch
    // failure doesn't make us retry on every launch.
    setString(KEY_LAST_CHECKED, String(Date.now()));

    if (!result.hasUpdate || !result.storeVersion) return;

    const dismissed = getString(KEY_DISMISSED_VERSION);
    if (dismissed === result.storeVersion) return;

    const storeVersion = result.storeVersion;
    const storeUrl = result.storeUrl;

    Alert.alert(
      "Update available",
      `A newer version (${storeVersion}) is available. You're on ${NATIVE_VERSION}.`,
      [
        {
          text: "Skip this version",
          onPress: () => setString(KEY_DISMISSED_VERSION, storeVersion),
        },
        { text: "Later", style: "cancel" },
        {
          text: "Update",
          onPress: () => {
            if (storeUrl) void Linking.openURL(storeUrl);
          },
        },
      ],
    );
  } catch {
    // Auto-check failures are silent — the manual button on the settings
    // screen surfaces errors when the user explicitly asks.
  }
}
