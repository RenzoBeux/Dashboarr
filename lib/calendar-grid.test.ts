import {
  getCalendarGrid,
  getFetchRange,
  orderedWeekdays,
} from "./calendar-grid";

// August 2026: Aug 1 is a Saturday, Aug 31 is a Monday, 31 days.
const YEAR = 2026;
const AUG = 7;

describe("orderedWeekdays", () => {
  it("keeps Sunday first for firstDow=0", () => {
    expect(orderedWeekdays(0)).toEqual([
      "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
    ]);
  });

  it("rotates to Monday first for firstDow=1", () => {
    expect(orderedWeekdays(1)).toEqual([
      "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
    ]);
  });

  it("rotates to Saturday first for firstDow=6", () => {
    expect(orderedWeekdays(6)).toEqual([
      "Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri",
    ]);
  });
});

describe("getCalendarGrid", () => {
  it("pads a Sunday-start grid so Aug 1 (Saturday) lands in column 6", () => {
    const grid = getCalendarGrid(YEAR, AUG, 0);
    expect(grid.length % 7).toBe(0);
    // 6 padding cells from July (Sun Jul 26 – Fri Jul 31)
    expect(grid[0]).toEqual({ day: 26, dateKey: "2026-07-26", inMonth: false });
    expect(grid[6]).toEqual({ day: 1, dateKey: "2026-08-01", inMonth: true });
    // Aug 31 is a Monday → 5 trailing September cells close the last week
    expect(grid[grid.length - 1]).toEqual({
      day: 5,
      dateKey: "2026-09-05",
      inMonth: false,
    });
    expect(grid.length).toBe(42);
  });

  it("pads a Monday-start grid so Aug 1 (Saturday) lands in column 5", () => {
    const grid = getCalendarGrid(YEAR, AUG, 1);
    expect(grid.length % 7).toBe(0);
    // 5 padding cells from July (Mon Jul 27 – Fri Jul 31)
    expect(grid[0]).toEqual({ day: 27, dateKey: "2026-07-27", inMonth: false });
    expect(grid[5]).toEqual({ day: 1, dateKey: "2026-08-01", inMonth: true });
    // Aug 31 is a Monday → it opens the last row, 6 September cells follow
    expect(grid[grid.length - 7]).toEqual({
      day: 31,
      dateKey: "2026-08-31",
      inMonth: true,
    });
    expect(grid[grid.length - 1]).toEqual({
      day: 6,
      dateKey: "2026-09-06",
      inMonth: false,
    });
    expect(grid.length).toBe(42);
  });

  it("adds no leading padding when the month starts on the week's first day", () => {
    // June 2026 starts on a Monday
    const grid = getCalendarGrid(2026, 5, 1);
    expect(grid[0]).toEqual({ day: 1, dateKey: "2026-06-01", inMonth: true });
  });

  it("adds no trailing padding when the month ends on the week's last day", () => {
    // May 2026 ends on Sunday May 31 — last cell of a Monday-start grid
    const grid = getCalendarGrid(2026, 4, 1);
    expect(grid[grid.length - 1]).toEqual({
      day: 31,
      dateKey: "2026-05-31",
      inMonth: true,
    });
  });

  it("handles a Saturday-start week", () => {
    const grid = getCalendarGrid(YEAR, AUG, 6);
    // Aug 1 is a Saturday → no leading padding at all
    expect(grid[0]).toEqual({ day: 1, dateKey: "2026-08-01", inMonth: true });
  });
});

describe("getFetchRange", () => {
  it("covers the Sunday-start grid ±1 day", () => {
    const { start, end } = getFetchRange(YEAR, AUG, 0);
    // Grid runs Jul 26 – Sep 5; range pads one day each side
    expect(start).toBe("2026-07-25");
    expect(end).toBe("2026-09-06");
  });

  it("covers the Monday-start grid ±1 day", () => {
    const { start, end } = getFetchRange(YEAR, AUG, 1);
    // Grid runs Jul 27 – Sep 6; range pads one day each side
    expect(start).toBe("2026-07-26");
    expect(end).toBe("2026-09-07");
  });
});
