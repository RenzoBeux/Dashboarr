import type { ServiceId, WidgetId, UiScale } from "@/lib/constants";
import type { SeerrAuthMode } from "@/lib/seerr-auth";
import type { AppThemeId } from "@/lib/app-themes";
import type { WeekStart } from "@/lib/week-start-values";

/**
 * The configuration payload types: what the store holds, what the export file
 * carries, and what the backend backup slots contain. Pure on purpose — this
 * module is bundled into the backend's web editor alongside store/config-schema
 * and store/config-migrations, so it must never import React Native, Expo or
 * the store itself. store/config-store.ts re-exports everything here.
 */

export interface WakeOnLanDevice {
  id: string;
  name: string;
  mac: string;
  broadcastAddress?: string;
  port?: number;
}

// A user-defined web shortcut shown on the Shortcuts dashboard widget (#344).
// `icon` is a lucide name from lib/dashboard-icons.ts and `color` a hex from
// lib/dashboard-colors.ts; both are optional and fall back at render time.
export interface WebShortcut {
  id: string;
  name: string;
  url: string;
  icon?: string;
  color?: string;
}

export interface HomeNetwork {
  id: string;
  ssid: string;
  // Optional AP MAC pin. Empty string means SSID-only match for this entry —
  // the rogue-AP guard from v6 lives per-entry now so each AP in a mesh can
  // carry its own pin.
  bssid: string;
}

// Per-service connection config (URLs, enabled flag, display name). One
// ServiceInstance row exists per configured server — users can have multiple
// rows of the same kind (e.g. two qBittorrents).
export interface ServiceConfig {
  enabled: boolean;
  name: string;
  localUrl: string;
  remoteUrl: string;
  useRemote: boolean;
  // v23: opt this server out of TLS certificate validation (accept self-signed
  // / otherwise-invalid certs). Per-instance and off by default. The hostnames
  // of instances with this on are pushed to the native layer (see
  // lib/insecure-tls.ts), which bypasses trust evaluation for exactly those
  // hosts. Absent/undefined behaves like false.
  ignoreCertErrors?: boolean;
  // v36 (#287): per-instance defaults preselected in the arr add flows
  // (components/common/add-media-sheet.tsx). Absent/undefined keeps the
  // previous "first in the server's list" behavior; a stale value (profile or
  // folder deleted upstream) also falls back to first-in-list at add time.
  // defaultMetadataProfileId is Lidarr-only.
  defaultQualityProfileId?: number;
  defaultRootFolderPath?: string;
  defaultMetadataProfileId?: number;
  // v41 (#289): qBittorrent-only — tag torrents added manually from the app
  // with "Dashboarr" so server-side scripts/filters can identify their origin.
  // Off by default (absent/undefined behaves like false) because enabling it
  // writes a tag into the user's qBittorrent config on first use.
  tagAddedTorrents?: boolean;
  // v52 (#332): Seerr-only — file every request from this instance on behalf of
  // another Seerr account, so a household sharing one admin API key can still
  // see who asked for what. Absent/undefined keeps the previous behavior: the
  // request is attributed to the API key's own identity (the admin). A stale id
  // (user deleted upstream) makes Seerr reject the request rather than silently
  // fall back, so the settings card re-resolves the id against the live user
  // list and shows it as unknown when it no longer matches.
  requestAsUserId?: number;
  // v57 (#386): unRAID-only — the id of the Glances instance that supplies
  // per-disk read/write rates for this server's drives. unRAID's own API
  // hardcodes numReads/numWrites to 0 and has no throughput field, so the only
  // source is a Glances running on the same machine. Deliberately an explicit
  // pairing rather than a guess: matching the two by URL hostname looks right
  // but isn't (one public hostname can port-forward to different machines), and
  // a wrong match paints another server's disk activity onto these drives.
  // Absent/undefined means no I/O is shown and no Glances query is made. A
  // stale id (instance deleted) reads as absent.
  diskIoInstanceId?: string;
  // v53 (#332): Seerr-only sign-in mode. Absent/undefined means the admin
  // API key (the pre-v53 behavior). The three session values ride Seerr's
  // login cookie instead; see lib/seerr-auth.ts for what each one posts and
  // which secret slot it reads. Only the editor writes this, and it writes
  // `undefined` rather than "apiKey" so exports keep the absent shape.
  authMode?: SeerrAuthMode;
}

// A configured service instance: a ServiceConfig plus a stable UUID `id` that
// keys per-instance secrets, query cache, and per-instance widget bindings.
// The UUID is generated on instance creation and is preserved across renames,
// reorders, and exports/imports.
export interface ServiceInstance extends ServiceConfig {
  id: string;
}

export interface ServiceSecrets {
  apiKey?: string;
  username?: string;
  password?: string;
  // Per-service custom HTTP headers (e.g. CF-Access-Client-Id for reverse-proxy
  // auth). Stored alongside other secrets in SecureStore because values often
  // contain bearer tokens.
  customHeaders?: Record<string, string>;
}

// Per-slot settings live as an opaque record on the slot itself. The widget
// registry owns the shape (via defaultSettings) — the store just persists what
// each widget hands back. Values must be plain JSON-serializable objects.
export type WidgetSlotSettings = Record<string, unknown>;

// One widget on a dashboard. Carries a stable UUID `id` so settings stay tied
// to this specific placement even if the user removes the widget and re-adds
// it later (which gets a fresh slot id and so a fresh empty settings record).
// `widgetId` keys into WIDGET_REGISTRY for the component/icon/defaults.
export interface WidgetSlot {
  id: string;
  widgetId: WidgetId;
  settings?: WidgetSlotSettings;
}

// A user-named dashboard. Each user has at least one (the auto-created
// "Default"). The active one — selected via `activeDashboardId` — is what the
// dashboard screen renders. Slot ids are globally unique across all dashboards
// because they live in our memory at the same time and the slot-keyed query
// cache would otherwise collide.
//
// v20: dashboards become workspaces. `attachedInstances` filters every
// dashboard-aware surface at per-instance granularity (so a user with two
// Radarrs can attach the "Home" instance to one dashboard and the "Cabin"
// instance to another, without the Cabin Radarr's offline status leaking
// into the Home dashboard's health grid). `pinnedTabs` orders the
// user-chosen middle slots of the bottom tab bar; kind-level pickability
// still applies (e.g. a Movies tab needs at least one attached Radarr).
// `icon` and `color` give each workspace a visual identity surfaced in the
// picker, the dashboard header, and the bottom Dashboard tab. All four are
// optional so pre-v20 dashboards (and external imports) still validate.
export interface Dashboard {
  id: string;
  name: string;
  widgets: WidgetSlot[];
  // lucide icon name (e.g. "Film"). Unknown names fall back to the default
  // at render time via resolveDashboardIcon.
  icon?: string;
  // hex string from the curated palette in lib/dashboard-colors.ts. Unknown
  // values fall back to the default via resolveDashboardColor.
  color?: string;
  // Instance UUIDs attached to this workspace (per-instance, not per-kind).
  // Missing/undefined behaves like "all current instances attached" so
  // pre-v20 dashboards keep their global behavior. Stored UUIDs that no
  // longer match a live instance are ignored silently — re-creating an
  // instance with the same UUID restores its attachment without a re-pick.
  attachedInstances?: string[];
  // Route names of the middle bottom-tab slots, in display order. Capped at
  // MAX_PINNED_TABS by the setter. Missing/undefined falls back to the
  // pre-v20 bottom bar (downloads / calendar / services where applicable).
  pinnedTabs?: string[];
  // v22: per-workspace active instance selection. Each kind that has an entry
  // pins a specific UUID; kinds without an entry resolve at read time to the
  // first attached enabled instance of that kind. Stored UUIDs that fall out
  // of the dashboard's attached set (or get disabled / deleted) are silently
  // ignored by the resolver — they don't need to be cleaned eagerly, except
  // on instance delete (we prune to keep storage tidy).
  activeInstance?: Partial<Record<ServiceId, string>>;
  // v29: optional per-workspace home-network selection (#148). Missing/undefined
  // means "use ALL home networks" (the default), mirroring how
  // `attachedInstances === undefined` means auto-attach. An explicit array
  // selects a subset of the GLOBAL homeNetworks by id — ids that no longer match
  // a live network are ignored at resolve time, and an empty array means "no
  // home network for this workspace → always remote". Home networks themselves
  // are created/edited/deleted only on the Home Networks screen; this is purely
  // which of them attach to this workspace. The *active* dashboard's selection
  // drives the global away flag (see resolveEffectiveHomeNetworks /
  // evaluateHomeNetwork in lib/network.ts); an instance attached only to other
  // dashboards is judged against their selections instead (the store's
  // resolveInstanceNetwork, #418).
  homeNetworkIds?: string[];
  // v30: optional per-workspace Services-tab tile order. Missing/undefined means
  // "use the global servicesOrder" so existing dashboards keep the shared order.
  // Unknown ids are skipped at render time; kinds missing from the list fall in
  // at the end in canonical order (same forgiving semantics as the global
  // servicesOrder), so adding a new service kind never hides it.
  servicesOrder?: ServiceId[];
  // v37: optional per-workspace overrides for the middle bottom-tab icons
  // (#195). Keys are TabRouteIds, values lucide names from the curated
  // registry in lib/dashboard-icons. A missing key (or unknown icon name)
  // falls back to the default at render time via resolveTabIcon, so only
  // actual overrides are stored — picking the default removes the entry.
  // Kept loose (string/string) like `icon`/`pinnedTabs` so entries survive
  // app upgrades that add/remove tabs or icons.
  tabIcons?: Record<string, string>;
}

// Legacy widget-settings shape carried by v13 exports. v13→v14 migration folds
// these into per-slot settings on the auto-built Default dashboard. We still
// export the type so the v14 export migration can reference it.
export type WidgetSettingsMap = Partial<Record<WidgetId, Record<string, unknown>>>;

// Notification preferences (v2+). Lives on the config store so it hydrates
// after initStorage() completes — the old standalone notifications-store
// hydrated synchronously before the AsyncStorage cache was populated, which
// caused the "enabled" toggle to revert to `true` on every cold start.
// Notification categories that can be toggled per-event-type. Kept as a
// string-literal union next to NotificationSettings so adding/removing a
// category is a single source of truth.
export type NotifCategory =
  | "torrentCompleted"
  | "sabnzbdCompleted"
  | "nzbgetCompleted"
  | "radarrDownloaded"
  | "sonarrDownloaded"
  | "serviceOffline"
  | "overseerrNewRequest"
  // Tracearr webhook events. Exposed per-instance only (in each Tracearr
  // instance's editor) — no global toggle rows — so the per-instance override
  // is the primary control; these globals are the inherit/fallback defaults.
  | "tracearrViolation"
  | "tracearrNewDevice"
  | "tracearrTrustScore"
  | "tracearrServerDown"
  | "tracearrServerUp"
  | "tracearrStreamStarted"
  | "tracearrStreamStopped";

// v34 (issue #220): optional Apprise sink. Persistent config-key model — the
// user configures their service URLs in the Apprise server's own UI under a key
// and stores only the full notify endpoint (e.g. http://host:8000/notify/
// dashboarr) plus an optional tag filter here. No service secrets live in the app.
export interface AppriseConfig {
  enabled: boolean;
  url: string;
  tags: string;
}

export interface NotificationSettings {
  enabled: boolean;
  torrentCompleted: boolean;
  sabnzbdCompleted: boolean;
  nzbgetCompleted: boolean;
  radarrDownloaded: boolean;
  sonarrDownloaded: boolean;
  serviceOffline: boolean;
  overseerrNewRequest: boolean;
  tracearrViolation: boolean;
  tracearrNewDevice: boolean;
  tracearrTrustScore: boolean;
  tracearrServerDown: boolean;
  tracearrServerUp: boolean;
  tracearrStreamStarted: boolean;
  tracearrStreamStopped: boolean;
  // v21: per-instance overrides keyed by instance UUID. A category absent from
  // an instance's override map falls through to the global toggle. Allows
  // "notify me from the primary Radarr but stay silent from the testing one"
  // without splitting the global toggles per kind.
  perInstance?: Record<string, Partial<Record<NotifCategory, boolean>>>;
  // v34: Apprise notification sink (additive to Expo push). undefined = unset.
  apprise?: AppriseConfig;
  // v42 (issue #310): per-qBittorrent-instance muted category names for the
  // torrentCompleted notification (e.g. cross-seed's injection category).
  // Keyed by instance UUID; "" mutes uncategorized torrents. Matching is exact
  // and case-sensitive. Absent/empty = notify for everything.
  qbtMutedCategories?: Record<string, string[]>;
}



export interface ExportPayload {
  version: number;
  exportedAt: string;
  // v13: array of ServiceInstance per kind, each carrying a UUID id.
  services: Record<ServiceId, ServiceInstance[]>;
  // v13: keyed by instance UUID, not ServiceId.
  secrets: Record<string, ServiceSecrets>;
  autoSwitchNetwork: boolean;
  // v11 — replaces homeSSID/homeBSSID with a per-AP list so mesh setups can
  // register every SSID/BSSID pair the user considers "home".
  homeNetworks: HomeNetwork[];
  // v14: per-user named dashboards with per-slot settings. Replaces the v7-v13
  // `dashboardWidgets: WidgetId[]` + `widgetSettings: Record<WidgetId, …>`.
  dashboards: Dashboard[];
  activeDashboardId: string;
  // v2 (v49: + ignoreCertErrors)
  backend?: {
    url: string | null;
    sharedSecret: string | null;
    deviceId: string | null;
    ignoreCertErrors?: boolean;
  };
  notificationSettings?: NotificationSettings;
  // v4
  wolDevices?: WakeOnLanDevice[];
  // v8
  hapticsEnabled?: boolean;
  // v10
  globalCustomHeaders?: Record<string, string>;
  // v12
  uiScale?: UiScale;
  // v17 — user-defined Services tab tile order.
  servicesOrder?: ServiceId[];
  // v32 — opt-in "VPN connected counts as home" (#185).
  treatVpnAsHome?: boolean;
  // v38 — global app theme preset.
  appTheme?: AppThemeId;
  // v40 — calendar first-day-of-week preference (#320).
  weekStart?: WeekStart;
  // v56 — user-defined web shortcuts for the Shortcuts widget (#344).
  shortcuts?: WebShortcut[];
}
