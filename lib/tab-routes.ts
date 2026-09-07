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
  "library",
  "music",
  "books",
  "requests",
  "activity",
  "indexers",
  "plex",
  "jellyfin",
  "emby",
  "navidrome",
  "glances",
  "bazarr",
  "unraid",
  "tdarr",
  "autobrr",
  "cleanuparr",
  "pihole",
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
  lidarr: "music",
  bindery: "books",
  overseerr: "requests",
  // The stream monitors share the Activity tab — it aggregates whichever of
  // Tautulli / Tracearr / JellyStat is attached (see lib/monitor-adapter.ts).
  tautulli: "activity",
  tracearr: "activity",
  jellystat: "activity",
  prowlarr: "indexers",
  jackett: "indexers",
  nzbhydra2: "indexers",
  plex: "plex",
  jellyfin: "jellyfin",
  emby: "emby",
  navidrome: "navidrome",
  glances: "glances",
  bazarr: "bazarr",
  unraid: "unraid",
  tdarr: "tdarr",
  autobrr: "autobrr",
  cleanuparr: "cleanuparr",
  pihole: "pihole",
};

// Inverse — the service kind(s) that back each tab. Used to decide pickability
// (a tab is pickable when ANY of its kinds is attached) and to validate pins.
// The Activity tab aggregates the stream monitors (Tautulli + Tracearr) plus
// the media servers' live sessions (Jellyfin + Emby) — see lib/monitor-adapter.ts.
const TAB_TO_SERVICES: Partial<Record<PickableServiceTab, ServiceId[]>> = {
  movies: ["radarr"],
  tv: ["sonarr"],
  // The Library tab combines both Radarr and Sonarr behind a Movies/TV
  // switcher, so it's pickable when either is attached. It's an additive
  // alternative to the dedicated Movies/TV tabs — SERVICE_TO_TAB still maps
  // radarr→movies and sonarr→tv so existing deep-links are unchanged.
  library: ["radarr", "sonarr"],
  music: ["lidarr"],
  books: ["bindery"],
  requests: ["overseerr"],
  // Jellyfin/Emby are additive here — SERVICE_TO_TAB still points them at their
  // dedicated tabs, but the Activity tab is also pickable when they're attached.
  // JellyStat is an Activity-only stream monitor (history + stats for Jellyfin).
  activity: ["tautulli", "tracearr", "jellystat", "jellyfin", "emby"],
  // The Indexers tab hosts both indexer proxies behind a source switcher.
  indexers: ["prowlarr", "jackett", "nzbhydra2"],
  plex: ["plex"],
  jellyfin: ["jellyfin"],
  emby: ["emby"],
  // Navidrome is a music server, not an *arr — it gets its own tab rather
  // than sharing the Lidarr-backed Music tab, which is a library/automation view.
  navidrome: ["navidrome"],
  glances: ["glances"],
  bazarr: ["bazarr"],
  unraid: ["unraid"],
  tdarr: ["tdarr"],
  autobrr: ["autobrr"],
  cleanuparr: ["cleanuparr"],
  pihole: ["pihole"],
};

export function tabForServiceId(id: ServiceId): PickableServiceTab | null {
  return SERVICE_TO_TAB[id] ?? null;
}

export function serviceForTab(tab: PickableServiceTab): ServiceId | null {
  return TAB_TO_SERVICES[tab]?.[0] ?? null;
}

const DOWNLOAD_KINDS: ServiceId[] = [
  "qbittorrent",
  "rtorrent",
  "transmission",
  "deluge",
  "sabnzbd",
  "nzbget",
];
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
    const svcs = TAB_TO_SERVICES[tab];
    if (svcs && svcs.some((s) => attached.has(s))) out.push(tab);
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

// ---------------------------------------------------------------------------
// Tab groups (#330)
//
// Every tab is an expo-router group with its own native stack, so the bottom
// bar stays visible on nested screens and each tab keeps its own position:
//   app/(tabs)/(<id>)/<id>.tsx   the tab root; the URL stays /<id>
//   app/(tabs)/(a,b,c)/...       screens shared by tabs a, b and c
// lib/tab-route-tree.test.ts keeps the file tree in sync with this list.

export type AnyTabRouteId = "dashboard" | TabRouteId | "settings";

// Bar order: Dashboard, the pickable middle tabs, Settings.
export const ALL_TAB_ROUTE_IDS: readonly AnyTabRouteId[] = [
  "dashboard",
  ...ALL_PICKABLE_TABS,
  "settings",
];

export const ALL_TAB_ROUTE_ID_SET: ReadonlySet<string> = new Set(ALL_TAB_ROUTE_IDS);

export function tabGroupName(id: AnyTabRouteId): string {
  return `(${id})`;
}

// `unstable_settings` for the shared array-group layout. Keys are the group
// names WITHOUT parentheses (expo-router reads settings[groupName]). This is
// the only thing that anchors each group's stack on its tab root at runtime;
// without it a stack would start on its shortest route name instead.
export const TAB_STACK_ANCHORS: Readonly<Record<string, { anchor: string }>> =
  Object.fromEntries(ALL_TAB_ROUTE_IDS.map((id) => [id, { anchor: id }]));

// One human label per tab. React Navigation derives a tab's accessible name
// from `title` / `tabBarAccessibilityLabel` and otherwise falls back to the
// ROUTE NAME, which since #330 is the group name "(tv)". The bar hides labels
// (`tabBarShowLabel: false`), so this map is the only name a screen reader
// gets. It also drives the pin list in the dashboard editor. Typed as a full
// Record on purpose: adding an id to PICKABLE_*_TABS is a compile error here
// until a label is supplied.
export const TAB_LABELS: Record<AnyTabRouteId, string> = {
  dashboard: "Dashboard",
  downloads: "Downloads",
  calendar: "Calendar",
  services: "Services",
  movies: "Movies",
  tv: "TV",
  library: "Library",
  music: "Music",
  books: "Books",
  requests: "Requests",
  activity: "Activity",
  indexers: "Indexers",
  plex: "Plex",
  jellyfin: "Jellyfin",
  emby: "Emby",
  navidrome: "Navidrome",
  glances: "Glances",
  bazarr: "Bazarr",
  unraid: "unRAID",
  tdarr: "Tdarr",
  autobrr: "Autobrr",
  cleanuparr: "Cleanuparr",
  pihole: "Pi-hole",
  settings: "Settings",
};

// Notifications and OS deep links to content details land in the Dashboard
// stack: it's the only tab that is always present and pinned, so the result
// is the same cold and warm, and the user's other tab stacks stay untouched.
export const DASHBOARD_STACK_PREFIX = "/(tabs)/(dashboard)";

// The tab owning the focused route, from useSegments(), e.g.
// ["(tabs)", "(tv)", "series", "[id]"] -> "tv". Null outside the tabs
// (dashboard-edit lives on the root stack).
export function tabIdFromSegments(
  segments: readonly string[],
): AnyTabRouteId | null {
  if (segments[0] !== "(tabs)") return null;
  const id = /^\((.+)\)$/.exec(segments[1] ?? "")?.[1];
  return id && ALL_TAB_ROUTE_ID_SET.has(id) ? (id as AnyTabRouteId) : null;
}
