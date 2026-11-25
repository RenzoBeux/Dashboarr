import type { WidgetViewModel } from "@/widgets/fetch-agenda";
import { DAYS_AHEAD } from "@/widgets/widget-config";

// The JSON the iOS widget extension reads from the App Group (#477), decoded by
// ReleasingSoonSnapshot in targets/widget/ReleasingSoonSnapshot.swift. Bump `v`
// and teach the Swift side when the shape changes: an installed widget can be
// older or newer than the bundle that writes it (OTA updates).
//
// Day labels are left out on purpose: the widget computes "Today"/"Tomorrow"
// from `dateKey` at render time, so they stay right while the app is closed.
// Nothing here is a secret: titles, local dates, in-app routes and public
// poster URLs only.
export interface IosWidgetSnapshot {
  v: 1;
  state: WidgetViewModel["state"];
  generatedAt: number;
  scheme: string;
  daysAhead: number;
  items: {
    id: string;
    kind: "episode" | "movie";
    title: string;
    subtitle: string;
    dateKey: string;
    posterUrl: string | null;
    barColor: string;
    hasFile: boolean;
    route: string;
  }[];
}

export function buildIosWidgetSnapshot(
  vm: WidgetViewModel,
  scheme: string,
  now: number,
): IosWidgetSnapshot {
  return {
    v: 1,
    state: vm.state,
    generatedAt: now,
    scheme,
    daysAhead: DAYS_AHEAD,
    items: vm.items.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      subtitle: item.subtitle,
      dateKey: item.dateKey,
      posterUrl: item.posterUrl,
      barColor: item.barColor,
      hasFile: item.hasFile,
      route: item.route,
    })),
  };
}
