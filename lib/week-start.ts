import { getCalendars } from "expo-localization";

// First-day-of-week preference for the calendar grid (#320). "auto" follows
// the device — on iOS that's Settings > General > Language & Region > First
// Day of Week; on Android it's derived from the locale.
export const WEEK_STARTS = ["auto", "sunday", "monday"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export const DEFAULT_WEEK_START: WeekStart = "auto";

export function isValidWeekStart(value: unknown): value is WeekStart {
  return (WEEK_STARTS as readonly unknown[]).includes(value);
}

/**
 * Resolve the preference to a JS day-of-week number (0 = Sunday … 6 =
 * Saturday, matching Date.getDay()). "auto" can yield any day — e.g. 6
 * (Saturday) in locales that start the week there — and the grid math in
 * lib/calendar-grid.ts handles the general case.
 */
export function resolveWeekStartDow(setting: WeekStart): number {
  if (setting === "sunday") return 0;
  if (setting === "monday") return 1;
  // expo-localization firstWeekday: 1 = Sunday … 7 = Saturday (may be null
  // on some Android devices — fall back to Sunday).
  const firstWeekday = getCalendars()[0]?.firstWeekday;
  return typeof firstWeekday === "number" ? (firstWeekday - 1 + 7) % 7 : 0;
}
