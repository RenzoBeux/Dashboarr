import { useCallback, useEffect, useRef, useState } from "react";
import { Linking, Platform } from "react-native";
import { checkStoreVersion } from "@/lib/app-version";
import {
  UPDATE_SNOOZE_MS,
  shouldCheckForUpdate,
  shouldPromptForUpdate,
} from "@/lib/app-update-schedule";
import { getString, setString } from "@/store/storage";

const KEY_LAST_CHECKED = "app-update.last-checked-at";
const KEY_DISMISSED_VERSION = "app-update.dismissed-version";
const KEY_SNOOZE_UNTIL = "app-update.snooze-until";
// Defer the network call so it doesn't compete with the cold-start work that
// actually matters (rendering, hydration, query refetches).
const STARTUP_DELAY_MS = 4000;

export interface PendingUpdate {
  storeVersion: string;
  storeUrl: string;
}

export interface AppUpdateState {
  /** Non-null while the styled prompt should be shown. */
  pending: PendingUpdate | null;
  /** "Update now" — open the store / release page. */
  openStore: (url: string) => void;
  /** "Skip this version" — never prompt for this version again. */
  skipVersion: (version: string) => void;
  /** "Later" / dismiss — silence the prompt for a week. */
  snoozeUpdate: () => void;
}

/**
 * Once per day, on cold start, asks the relevant store (App Store on iOS,
 * Play Store / GitHub on Android) what version is published and, if a newer
 * one exists, surfaces a prompt. The actual UI is a styled ActionSheet (see
 * components/common/app-update-checker.tsx) — never a native Alert — so it
 * matches the rest of the app and obeys the no-native-dialog rule.
 *
 * Anti-spam: "Later" (or dismissing the sheet) snoozes the prompt for a week,
 * and "Skip this version" silences that version for good. Skipped in
 * development. The manual "Check for updates" button in settings is unaffected.
 */
export function useAppUpdateCheck(): AppUpdateState {
  const ranRef = useRef(false);
  const [pending, setPending] = useState<PendingUpdate | null>(null);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    if (__DEV__) return;
    if (Platform.OS !== "ios" && Platform.OS !== "android") return;

    const now = Date.now();
    const lastChecked = Number(getString(KEY_LAST_CHECKED)) || 0;
    const snoozeUntil = Number(getString(KEY_SNOOZE_UNTIL)) || 0;
    if (!shouldCheckForUpdate({ now, lastChecked, snoozeUntil })) return;

    const timer = setTimeout(() => {
      void runUpdateCheck(setPending);
    }, STARTUP_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // The action's data (url / version) is captured by the caller at render time,
  // so these handlers don't read `pending` — which the sheet's onClose has
  // already cleared by the time an action fires.
  const openStore = useCallback((url: string) => {
    if (url) void Linking.openURL(url);
    setPending(null);
  }, []);

  const skipVersion = useCallback((version: string) => {
    if (version) setString(KEY_DISMISSED_VERSION, version);
    setPending(null);
  }, []);

  const snoozeUpdate = useCallback(() => {
    setString(KEY_SNOOZE_UNTIL, String(Date.now() + UPDATE_SNOOZE_MS));
    setPending(null);
  }, []);

  return { pending, openStore, skipVersion, snoozeUpdate };
}

async function runUpdateCheck(
  setPending: (p: PendingUpdate | null) => void,
): Promise<void> {
  try {
    const result = await checkStoreVersion();
    // Stamp the check time even on "unknown" so a transient store fetch
    // failure doesn't make us retry on every launch.
    setString(KEY_LAST_CHECKED, String(Date.now()));

    const dismissedVersion = getString(KEY_DISMISSED_VERSION);
    const { storeVersion, storeUrl } = result;
    if (
      !storeVersion ||
      !shouldPromptForUpdate({
        hasUpdate: result.hasUpdate,
        storeVersion,
        dismissedVersion,
      })
    ) {
      return;
    }

    setPending({ storeVersion, storeUrl });
  } catch {
    // Auto-check failures are silent — the manual button on the settings
    // screen surfaces errors when the user explicitly asks.
  }
}
