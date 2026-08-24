import { localDateKey } from "@/lib/utils";

// Month-grid math for the Calendar tab, parameterized by the first day of
// the week (0 = Sunday … 6 = Saturday, matching Date.getDay()) so the grid
// can start on Monday for locales/settings that want it (#320).

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Weekday header labels, rotated so index 0 is the week's first day. */
export function orderedWeekdays(firstDow: number): string[] {
  return WEEKDAY_LABELS.map((_, i) => WEEKDAY_LABELS[(firstDow + i) % 7]);
}

/** Column offset of a date within a week that starts on `firstDow`. */
function weekColumn(dow: number, firstDow: number): number {
  return (dow - firstDow + 7) % 7;
}

// Fetch the full visible grid (incl. prev/next-month padding cells) padded
// ±1 day, mirroring Sonarr's web UI. The padding keeps boundary episodes
// whose UTC day differs from the local day inside the server-side range
// filter; the extra day on `end` also matters because the *arr APIs treat a
// date-only end as midnight (exclusive of that day's airings).
export function getFetchRange(year: number, month: number, firstDow: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const start = new Date(year, month, 1 - weekColumn(first.getDay(), firstDow) - 1);
  const end = new Date(
    year,
    month,
    last.getDate() + (6 - weekColumn(last.getDay(), firstDow)) + 1,
  );
  return {
    start: localDateKey(start),
    end: localDateKey(end),
  };
}

export interface CalendarGridCell {
  day: number;
  dateKey: string;
  inMonth: boolean;
}

export function getCalendarGrid(
  year: number,
  month: number,
  firstDow: number,
): CalendarGridCell[] {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startCol = weekColumn(firstDay.getDay(), firstDow);
  const daysInMonth = lastDay.getDate();

  const cells: CalendarGridCell[] = [];

  // Previous month padding
  const prevLast = new Date(year, month, 0).getDate();
  for (let i = startCol - 1; i >= 0; i--) {
    const d = prevLast - i;
    const date = new Date(year, month - 1, d);
    cells.push({ day: d, dateKey: localDateKey(date), inMonth: false });
  }

  // Current month
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month, d);
    cells.push({ day: d, dateKey: localDateKey(date), inMonth: true });
  }

  // Next month padding
  const remaining = 7 - (cells.length % 7);
  if (remaining < 7) {
    for (let d = 1; d <= remaining; d++) {
      const date = new Date(year, month + 1, d);
      cells.push({ day: d, dateKey: localDateKey(date), inMonth: false });
    }
  }

  return cells;
}
