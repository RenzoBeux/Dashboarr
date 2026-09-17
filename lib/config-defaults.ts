import {
  DEFAULT_DASHBOARD_NAME,
  DEFAULT_DASHBOARD_WIDGETS,
  DEFAULT_UI_SCALE,
  SERVICE_DEFAULTS,
  SERVICE_IDS,
} from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { DEFAULT_APP_THEME } from "@/lib/app-themes";
import { DEFAULT_DASHBOARD_COLOR } from "@/lib/dashboard-colors";
import { DEFAULT_DASHBOARD_ICON } from "@/lib/dashboard-defaults";
import { generateInstanceId } from "@/lib/instance-id";
import { CURRENT_CONFIG_VERSION } from "@/store/config-migrations";
import type {
  Dashboard,
  ExportPayload,
  NotificationSettings,
  ServiceConfig,
  ServiceInstance,
} from "@/lib/config-types";

/**
 * Fresh-install defaults, shared by the app store and the backend's web editor
 * ("New configuration"). Pure: no React Native or Expo imports.
 */

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  enabled: true,
  torrentCompleted: true,
  sabnzbdCompleted: true,
  nzbgetCompleted: true,
  radarrDownloaded: true,
  sonarrDownloaded: true,
  serviceOffline: true,
  overseerrNewRequest: true,
  // Tracearr defaults mirror Tracearr's own webhook-channel routing: alerts and
  // server status on, trust-score and stream chatter off (opt-in per instance).
  tracearrViolation: true,
  tracearrNewDevice: true,
  tracearrTrustScore: false,
  tracearrServerDown: true,
  tracearrServerUp: true,
  tracearrStreamStarted: false,
  tracearrStreamStopped: false,
};

export function defaultServiceConfig(id: ServiceId): ServiceConfig {
  const defaults = SERVICE_DEFAULTS[id];
  return {
    enabled: false,
    name: defaults.name,
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
    ignoreCertErrors: false,
  };
}

// Build a single ServiceInstance with a freshly-generated UUID and the given
// (optional) overrides on top of the kind defaults.
export function makeInstance(
  id: ServiceId,
  init?: Partial<Omit<ServiceInstance, "id">>,
): ServiceInstance {
  return { id: generateInstanceId(), ...defaultServiceConfig(id), ...(init ?? {}) };
}

// Default state for a fresh install: each kind starts with one disabled
// instance carrying default URLs/credentials, mirroring the v12 UX where every
// service had a slot ready in settings.
export function defaultInstances(): Record<ServiceId, ServiceInstance[]> {
  const out = {} as Record<ServiceId, ServiceInstance[]>;
  for (const id of SERVICE_IDS) {
    out[id] = [makeInstance(id)];
  }
  return out;
}

// Build the auto-created Default dashboard for a fresh install. Each entry in
// DEFAULT_DASHBOARD_WIDGETS becomes a slot with a generated UUID and no
// per-slot settings (widgets fall back to their registry-declared defaults).
// v20: `attachedInstances` stays undefined so the auto-attach semantic
// (every current and future instance is included) covers fresh installs
// without requiring the user to revisit the picker every time they add a
// new instance. Once they open the editor and save, the dashboard
// transitions to an explicit list — i.e. they're in curated mode.
export function defaultDashboards(): Dashboard[] {
  return [
    {
      id: generateInstanceId(),
      name: DEFAULT_DASHBOARD_NAME,
      widgets: DEFAULT_DASHBOARD_WIDGETS.map((widgetId) => ({
        id: generateInstanceId(),
        widgetId,
      })),
      icon: DEFAULT_DASHBOARD_ICON,
      color: DEFAULT_DASHBOARD_COLOR,
      pinnedTabs: ["downloads", "calendar", "services"],
    },
  ];
}

/**
 * A complete, valid configuration for a brand-new install, at the current
 * schema version. What the web editor's "New configuration" starts from; it
 * validates unchanged through `validateExportPayload` and restores through the
 * app's normal import path. No `backend` block (a restoring phone keeps its
 * own pairing) and no `weekStart` (the phone resolves "auto" from the device).
 */
export function blankExportPayload(): ExportPayload {
  const dashboards = defaultDashboards();
  return {
    version: CURRENT_CONFIG_VERSION,
    exportedAt: new Date().toISOString(),
    services: defaultInstances(),
    secrets: {},
    autoSwitchNetwork: false,
    treatVpnAsHome: false,
    homeNetworks: [],
    servicesOrder: [],
    dashboards,
    activeDashboardId: dashboards[0]!.id,
    notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
    wolDevices: [],
    shortcuts: [],
    hapticsEnabled: true,
    globalCustomHeaders: {},
    uiScale: DEFAULT_UI_SCALE,
    appTheme: DEFAULT_APP_THEME,
  };
}
