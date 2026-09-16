import { getCalendars } from "expo-localization";
import type { WeekStart } from "@/lib/week-start-values";

// The values and validator live in lib/week-start-values.ts (pure); this
// module adds the device-dependent resolver. "auto" follows the device — on
// iOS that's Settings > General > Language & Region > First Day of Week; on
// Android it's derived from the locale.
export { WEEK_STARTS, DEFAULT_WEEK_START, isValidWeekStart } from "@/lib/week-start-values";
export type { WeekStart } from "@/lib/week-start-values";

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
