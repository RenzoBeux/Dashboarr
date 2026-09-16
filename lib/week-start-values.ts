// First-day-of-week preference for the calendar grid (#320). "auto" follows
// the device. Kept free of expo imports so the config schema (and the
// backend's web editor, which bundles it) can validate the value.
export const WEEK_STARTS = ["auto", "sunday", "monday"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export const DEFAULT_WEEK_START: WeekStart = "auto";

export function isValidWeekStart(value: unknown): value is WeekStart {
  return (WEEK_STARTS as readonly unknown[]).includes(value);
}
