// Pure scheduling logic for the app-update auto-check. Kept free of native
// imports so it stays trivially testable (see app-update-schedule.test.ts) and
// is the single source of truth for "should we check / should we nag".

/** Minimum time between background store checks, so we don't hit the store on
 *  every cold start. */
export const UPDATE_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** How long tapping "Later" (or dismissing the prompt) silences the launch
 *  prompt before we surface it again. */
export const UPDATE_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Whether the background check should hit the store now. Stays quiet while
 * snoozed ("Later" was tapped) and while inside the once-per-day throttle
 * window, so an open app never re-checks (or re-prompts) on every launch.
 */
export function shouldCheckForUpdate(opts: {
  now: number;
  lastChecked: number;
  snoozeUntil: number;
}): boolean {
  const { now, lastChecked, snoozeUntil } = opts;
  if (now < snoozeUntil) return false;
  return now - lastChecked >= UPDATE_CHECK_INTERVAL_MS;
}

/**
 * Whether a fetched store result should surface the launch prompt. A version
 * the user tapped "Skip this version" on never prompts again, even after the
 * snooze window lapses.
 */
export function shouldPromptForUpdate(opts: {
  hasUpdate: boolean;
  storeVersion: string | null;
  dismissedVersion: string | null | undefined;
}): boolean {
  const { hasUpdate, storeVersion, dismissedVersion } = opts;
  if (!hasUpdate || !storeVersion) return false;
  return dismissedVersion !== storeVersion;
}
