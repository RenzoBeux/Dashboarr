import type { ServiceId } from "@/lib/constants";
import { SERVICE_IDS } from "@/lib/constants";

// User-pickable middle tabs for the bottom bar. `dashboard` and `settings`
// are always pinned (rendered outside the user-chosen middle), so they're not
// in this list. Order chosen here mirrors today's static layout for
// continuity in the picker UI.
export const PICKABLE_META_TABS = ["downloads", "calendar", "services"] as const;
export type PickableMetaTab = (typeof PICKABLE_META_TABS)[number];

export const PICKABLE_SERVICE_TABS = [
  "movies",
  "tv",
  "requests",
  "activity",
  "indexers",
  "plex",
  "jellyfin",
  "emby",
  "glances",
  "bazarr",
] as const;
export type PickableServiceTab = (typeof PICKABLE_SERVICE_TABS)[number];

export type TabRouteId = PickableMetaTab | PickableServiceTab;

export const ALL_PICKABLE_TABS: readonly TabRouteId[] = [
  ...PICKABLE_META_TABS,
  ...PICKABLE_SERVICE_TABS,
];

// Hard cap on user-chosen middle tabs. Dashboard + N pinned + Settings.
// 3 keeps the bar at the comfortable 5-icon density.
export const MAX_PINNED_TABS = 3;

// Service → its dedicated tab route name. The dashboard Status widget already
// pushes via lib/service-routes.ts (which returns full paths including query
// params for download clients) — this map is for the tab-bar/pin layer, which
// only cares about the route segment.
const SERVICE_TO_TAB: Partial<Record<ServiceId, PickableServiceTab>> = {
  radarr: "movies",
  sonarr: "tv",
  overseerr: "requests",
  tautulli: "activity",
  prowlarr: "indexers",
  plex: "plex",
  jellyfin: "jellyfin",
  emby: "emby",
  glances: "glances",
  bazarr: "bazarr",
};

// Inverse — used when validating that a pinned tab still resolves to a
// service in the active dashboard's attached set.
const TAB_TO_SERVICE: Partial<Record<PickableServiceTab, ServiceId>> = {
  movies: "radarr",
  tv: "sonarr",
  requests: "overseerr",
  activity: "tautulli",
  indexers: "prowlarr",
  plex: "plex",
  jellyfin: "jellyfin",
  emby: "emby",
  glances: "glances",
  bazarr: "bazarr",
};

export function tabForServiceId(id: ServiceId): PickableServiceTab | null {
  return SERVICE_TO_TAB[id] ?? null;
}

export function serviceForTab(tab: PickableServiceTab): ServiceId | null {
  return TAB_TO_SERVICE[tab] ?? null;
}

const DOWNLOAD_KINDS: ServiceId[] = ["qbittorrent", "sabnzbd", "nzbget"];
const CALENDAR_KINDS: ServiceId[] = ["sonarr", "radarr"];

// Decide which tabs are even pickable for a dashboard, given its attached
// services. A pin to "downloads" only makes sense when at least one download
// client is attached; same for "calendar". The "services" grid is always
// pickable since it's a meta surface.
export function pickableTabIdsFor(
  attached: ReadonlySet<ServiceId>,
): TabRouteId[] {
  const out: TabRouteId[] = [];
  if (DOWNLOAD_KINDS.some((k) => attached.has(k))) out.push("downloads");
  if (CALENDAR_KINDS.some((k) => attached.has(k))) out.push("calendar");
  out.push("services");
  for (const tab of PICKABLE_SERVICE_TABS) {
    const svc = TAB_TO_SERVICE[tab];
    if (svc && attached.has(svc)) out.push(tab);
  }
  return out;
}

// Filter a stored pin list down to what's currently pickable. Pins for
// services that are no longer attached survive in storage but are hidden at
// render time, so re-attaching restores them without re-picking.
export function visiblePinnedTabs(
  pinned: readonly string[],
  attached: ReadonlySet<ServiceId>,
): TabRouteId[] {
  const pickable = new Set<string>(pickableTabIdsFor(attached));
  const out: TabRouteId[] = [];
  const seen = new Set<string>();
  for (const tab of pinned) {
    if (seen.has(tab)) continue;
    if (!pickable.has(tab)) continue;
    seen.add(tab);
    out.push(tab as TabRouteId);
    if (out.length >= MAX_PINNED_TABS) break;
  }
  return out;
}

// Compute the default pin list for an install at migration time. Mirrors the
// pre-v20 bottom bar (downloads / calendar / services) but drops entries that
// don't apply to this install so users without download clients don't see a
// dead Downloads tab on first launch after the upgrade.
export function defaultPinnedTabsForInstall(
  servicesByKind: Record<string, { enabled: boolean }[] | undefined>,
): TabRouteId[] {
  const enabledKinds = new Set<ServiceId>();
  for (const id of SERVICE_IDS) {
    const list = servicesByKind[id];
    if (Array.isArray(list) && list.some((i) => i?.enabled)) {
      enabledKinds.add(id);
    }
  }
  const defaults: TabRouteId[] = [];
  if (DOWNLOAD_KINDS.some((k) => enabledKinds.has(k))) defaults.push("downloads");
  if (CALENDAR_KINDS.some((k) => enabledKinds.has(k))) defaults.push("calendar");
  defaults.push("services");
  return defaults.slice(0, MAX_PINNED_TABS);
}

// Symbol shape used by callers that only have legacy `services: Record<id, { enabled: boolean }>`.
// Kept here so migration callers don't have to repeat the wrapping shim.
export function defaultPinnedTabsFromLegacy(
  services: Partial<Record<ServiceId, { enabled: boolean }>>,
): TabRouteId[] {
  const wrapped: Record<string, { enabled: boolean }[] | undefined> = {};
  for (const [id, cfg] of Object.entries(services)) {
    if (cfg) wrapped[id] = [{ enabled: cfg.enabled }];
  }
  return defaultPinnedTabsForInstall(wrapped);
}
