/**
 * Wire types for the read-only web UI (`GET /ui/api/overview` and
 * `GET /ui/api/session`). Deliberately import-free so `web/` can consume them
 * with a type-only import and stay decoupled from server code.
 *
 * Redaction contract: nothing here ever carries an API key, username,
 * password, WoL MAC, device shared secret, Expo push token or raw webhook
 * payload. `buildOverview` constructs every object field by field so a new
 * column on a stored row cannot leak by accident.
 */

export interface OverviewDevice {
  id: string;
  platform: string;
  appVersion: string | null;
  createdAt: number;
  lastSeenAt: number;
  /** Expo rejected the push token (DeviceNotRegistered); re-pair to fix. */
  invalid: boolean;
}

export interface OverviewPoller {
  intervalMs: number;
  lastRunAt: number | null;
  lastError: string | null;
  /** Start of the current unbroken run of failures; null while healthy. */
  failingSince: number | null;
}

export interface OverviewHealth {
  online: boolean;
  failCount: number;
  updatedAt: number;
}

export interface OverviewInstance {
  id: string;
  kind: string;
  name: string;
  enabled: boolean;
  useRemote: boolean;
  /** Origin + path only: userinfo, query string and fragment are stripped. Empty string when unset. */
  localUrl: string;
  remoteUrl: string;
  /** Which of the two the backend pollers actually use (BACKEND_USE_REMOTE plus the empty-URL fallback); null when both are empty. */
  activeUrl: "local" | "remote" | null;
  hasApiKey: boolean;
  hasCredentials: boolean;
  pollMs: number | null;
  updatedAt: number;
  /** Null when the kind has no poller, the instance is disabled, or it was skipped. */
  poller: OverviewPoller | null;
  /** Null until the shared health poller has observed the instance once. */
  health: OverviewHealth | null;
}

export interface OverviewWebhook {
  id: number;
  source: string;
  receivedAt: number;
  eventType: string | null;
  summary: string | null;
}

export interface Overview {
  version: string;
  uptimeMs: number;
  encryptionEnabled: boolean;
  /** PUBLIC_URL with userinfo, query string and fragment stripped. */
  publicUrl: string | null;
  /** BACKEND_USE_REMOTE; the app's useRemote is ignored server-side. Per instance, see `activeUrl`. */
  backendUseRemote: boolean;
  generatedAt: number;
  devices: OverviewDevice[];
  instances: OverviewInstance[];
  webhooks: OverviewWebhook[];
}

export interface UiSession {
  /** WEB_UI_PASSWORD is configured. */
  enabled: boolean;
  authenticated: boolean;
}
