import { SERVICE_DEFAULTS, SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { makeInstance } from "@/lib/config-defaults";
import type {
  AppriseConfig,
  ExportPayload,
  NotificationSettings,
  ServiceInstance,
  ServiceSecrets,
} from "@/lib/config-types";
import { SERVICE_CATALOG } from "@/lib/service-catalog";
import { seerrAuthMode, seerrHasCredential } from "@/lib/seerr-auth";
import type { SeerrAuthMode } from "@/lib/seerr-auth";

/**
 * Pure edits over an ExportPayload. Every function returns a new payload and
 * never mutates its input, so React state and tests stay simple. The rules
 * mirror the phone's own editor (components/integrations/service-editor.tsx
 * and store/config-store.ts removeInstance) so a config edited here is
 * indistinguishable from one edited on the phone.
 */

export type InstancePatch = Partial<Omit<ServiceInstance, "id">>;

/** The Seerr credentials as loaded, so switching back to the loaded mode restores them. */
export interface SeerrLoaded {
  mode: SeerrAuthMode;
  secrets: Pick<ServiceSecrets, "apiKey" | "username" | "password">;
}

export function addInstance(payload: ExportPayload, kind: ServiceId): { payload: ExportPayload; id: string } {
  const inst = makeInstance(kind, { name: SERVICE_DEFAULTS[kind].name });
  return {
    payload: { ...payload, services: { ...payload.services, [kind]: [...(payload.services[kind] ?? []), inst] } },
    id: inst.id,
  };
}

export function updateInstance(payload: ExportPayload, kind: ServiceId, id: string, patch: InstancePatch): ExportPayload {
  const list = (payload.services[kind] ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i));
  return { ...payload, services: { ...payload.services, [kind]: list } };
}

/** Empty strings delete the slot, like the phone's updateInstanceSecrets. */
export function updateSecrets(payload: ExportPayload, id: string, patch: Partial<ServiceSecrets>): ExportPayload {
  const next: ServiceSecrets = { ...(payload.secrets[id] ?? {}) };
  for (const key of ["apiKey", "username", "password"] as const) {
    if (!(key in patch)) continue;
    const value = patch[key];
    if (value) next[key] = value;
    else delete next[key];
  }
  if ("customHeaders" in patch) {
    if (patch.customHeaders && Object.keys(patch.customHeaders).length > 0) next.customHeaders = patch.customHeaders;
    else delete next.customHeaders;
  }
  const secrets = { ...payload.secrets };
  if (Object.keys(next).length === 0) delete secrets[id];
  else secrets[id] = next;
  return { ...payload, secrets };
}

/** Removes the instance and every reference to it, as the phone does. */
export function removeInstance(payload: ExportPayload, kind: ServiceId, id: string): ExportPayload {
  const services = { ...payload.services, [kind]: (payload.services[kind] ?? []).filter((i) => i.id !== id) };
  const secrets = { ...payload.secrets };
  delete secrets[id];
  const dashboards = payload.dashboards.map((d) => {
    const next = { ...d };
    if (next.attachedInstances) next.attachedInstances = next.attachedInstances.filter((x) => x !== id);
    if (next.activeInstance && next.activeInstance[kind] === id) {
      const active = { ...next.activeInstance };
      delete active[kind];
      next.activeInstance = active;
    }
    return next;
  });
  let notificationSettings = payload.notificationSettings;
  if (notificationSettings) {
    const ns: NotificationSettings = { ...notificationSettings };
    if (ns.perInstance && id in ns.perInstance) {
      const per = { ...ns.perInstance };
      delete per[id];
      ns.perInstance = per;
    }
    if (ns.qbtMutedCategories && id in ns.qbtMutedCategories) {
      const muted = { ...ns.qbtMutedCategories };
      delete muted[id];
      ns.qbtMutedCategories = muted;
    }
    notificationSettings = ns;
  }
  return { ...payload, services, secrets, dashboards, notificationSettings };
}

/**
 * Seerr's modes share the secret slots (apiKey is the admin key in one mode
 * and the plex.tv token in another), so a switch must not carry values
 * across. Blank the other family, except when returning to the loaded mode,
 * which restores what was loaded.
 */
export function setSeerrAuthMode(
  payload: ExportPayload,
  id: string,
  mode: SeerrAuthMode,
  loaded: SeerrLoaded | undefined,
): ExportPayload {
  let next = updateInstance(payload, "overseerr", id, { authMode: mode });
  const restore = loaded !== undefined && loaded.mode === mode;
  next = updateSecrets(next, id, {
    apiKey: restore ? loaded.secrets.apiKey ?? "" : "",
    username: restore ? loaded.secrets.username ?? "" : "",
    password: restore ? loaded.secrets.password ?? "" : "",
  });
  return next;
}

export function setNotification(
  payload: ExportPayload,
  key: Exclude<keyof NotificationSettings, "perInstance" | "apprise" | "qbtMutedCategories">,
  value: boolean,
): ExportPayload {
  return { ...payload, notificationSettings: { ...(payload.notificationSettings ?? emptyNotifications()), [key]: value } };
}

export function setApprise(payload: ExportPayload, patch: Partial<AppriseConfig>): ExportPayload {
  const base = payload.notificationSettings ?? emptyNotifications();
  const apprise: AppriseConfig = { enabled: false, url: "", tags: "", ...(base.apprise ?? {}), ...patch };
  return { ...payload, notificationSettings: { ...base, apprise } };
}

function emptyNotifications(): NotificationSettings {
  return {
    enabled: true,
    torrentCompleted: true,
    sabnzbdCompleted: true,
    nzbgetCompleted: true,
    radarrDownloaded: true,
    sonarrDownloaded: true,
    serviceOffline: true,
    overseerrNewRequest: true,
    tracearrViolation: true,
    tracearrNewDevice: true,
    tracearrTrustScore: false,
    tracearrServerDown: true,
    tracearrServerUp: true,
    tracearrStreamStarted: false,
    tracearrStreamStopped: false,
  };
}

/**
 * What the phone's editor does on save: "apiKey" is stored as absence,
 * a "request as" default only makes sense with the admin key, and the secret
 * family the mode does not use is purged so a stale key never sits next to a
 * person's password.
 */
export function normalizeForSave(payload: ExportPayload): ExportPayload {
  let next = payload;
  for (const inst of payload.services.overseerr ?? []) {
    const mode = seerrAuthMode(inst);
    const usesUserPass = mode === "mediaServer" || mode === "local";
    next = updateInstance(next, "overseerr", inst.id, {
      authMode: mode === "apiKey" ? undefined : mode,
      requestAsUserId: mode === "apiKey" ? inst.requestAsUserId : undefined,
    });
    next = updateSecrets(next, inst.id, usesUserPass ? { apiKey: "" } : { username: "", password: "" });
  }
  // `undefined` values must not survive into JSON as absent-vs-present noise
  // for the validator; strip them from the Seerr instances touched above.
  const services = { ...next.services };
  services.overseerr = (services.overseerr ?? []).map((inst) => {
    const clean: ServiceInstance = { ...inst };
    if (clean.authMode === undefined) delete clean.authMode;
    if (clean.requestAsUserId === undefined) delete clean.requestAsUserId;
    return clean;
  });
  return { ...next, services };
}

export interface EditorProblem {
  kind: ServiceId;
  instanceId: string;
  message: string;
}

/** Things the schema tolerates but a user would not want saved. */
export function editorProblems(payload: ExportPayload): EditorProblem[] {
  const problems: EditorProblem[] = [];
  for (const kind of SERVICE_IDS) {
    for (const inst of payload.services[kind] ?? []) {
      const label = inst.name || SERVICE_DEFAULTS[kind].name;
      if (inst.enabled && !inst.localUrl && !inst.remoteUrl) {
        problems.push({ kind, instanceId: inst.id, message: `${label}: enabled but has no URL` });
      }
      if (kind === "overseerr" && inst.enabled) {
        const mode = seerrAuthMode(inst);
        if (!seerrHasCredential(mode, payload.secrets[inst.id] ?? {})) {
          problems.push({ kind, instanceId: inst.id, message: `${label}: missing the credential its sign-in mode needs` });
        }
      } else if (inst.enabled && SERVICE_CATALOG[kind].authShape === "apiKey" && kind !== "tdarr") {
        if (!payload.secrets[inst.id]?.apiKey) {
          problems.push({ kind, instanceId: inst.id, message: `${label}: enabled but has no API key` });
        }
      }
    }
  }
  return problems;
}
