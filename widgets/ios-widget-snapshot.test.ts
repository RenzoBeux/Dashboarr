import { buildIosWidgetSnapshot } from "@/widgets/ios-widget-snapshot";
import type { AgendaItem } from "@/lib/calendar-agenda";

const item: AgendaItem = {
  id: "ep-inst-1",
  kind: "episode",
  title: "Severance",
  subtitle: "S02E04 · Woe's Hollow",
  dateKey: "2026-11-26",
  dateLabel: "Tomorrow",
  posterUrl: "https://image.tmdb.org/t/p/w500/abc.jpg",
  barColor: "#3b82f6",
  hasFile: false,
  route: "/series/12?instanceId=inst",
};

describe("buildIosWidgetSnapshot", () => {
  it("carries the agenda the Swift side decodes", () => {
    const snap = buildIosWidgetSnapshot({ state: "ok", items: [item] }, "dashboarr", 1000);
    expect(snap).toEqual({
      v: 1,
      state: "ok",
      generatedAt: 1000,
      scheme: "dashboarr",
      daysAhead: 7,
      items: [
        {
          id: "ep-inst-1",
          kind: "episode",
          title: "Severance",
          subtitle: "S02E04 · Woe's Hollow",
          dateKey: "2026-11-26",
          posterUrl: "https://image.tmdb.org/t/p/w500/abc.jpg",
          barColor: "#3b82f6",
          hasFile: false,
          route: "/series/12?instanceId=inst",
        },
      ],
    });
  });

  it("drops the precomputed day label: the widget computes it at render time", () => {
    const snap = buildIosWidgetSnapshot({ state: "ok", items: [item] }, "dashboarr", 0);
    expect(snap.items[0]).not.toHaveProperty("dateLabel");
  });

  it("keeps non-ok states so the widget can explain them", () => {
    expect(buildIosWidgetSnapshot({ state: "unavailable", items: [] }, "x", 0).state).toBe(
      "unavailable",
    );
  });
});
