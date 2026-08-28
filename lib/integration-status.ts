import { SERVICE_IDS, SERVICE_DEFAULTS, type ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";
import type { HealthStatusKind, ServiceHealthStatus } from "@/lib/types";

/**
 * Pure projection of (instances + health + network context) into the rows the
 * Integrations surfaces render.
 *
 * Two hard rules:
 *  - This module imports TYPES from store/config-store, never values. A value
 *    import pulls AsyncStorage and expo-secure-store into its test.
 *  - Nothing here reads the store or the network. The caller resolves each
 *    instance's active URL and LAN-guard verdict and passes them in, which is
 *    what makes every branch below testable.
 */

/**
 * Per-instance state.
 *
 * `away` exists because checkInstanceHealth reports a private LAN URL as
 * `unreachable` (hence `offline`) whenever the device is off the home network.
 * Without splitting it out, every hub visit on cellular would render a full
 * "Needs attention" list claiming a working setup is broken, which is worse
 * than the small per-row dot it replaces.
 */
export type InstanceState =
  | "ok"
  | "attention"
  | "away"
  | "checking"
  | "off"
  | "unconfigured";

/** What the caller must resolve per instance before building rows. */
export interface InstanceProbeContext {
  /** getActiveUrl(kind, instanceId) — the URL the app would really use now. */
  activeUrl: string;
  /** lanGuardBlockReason(activeUrl, inst) !== null. */
  lanBlocked: boolean;
}

export interface IntegrationInstanceRow {
  kind: ServiceId;
  instanceId: string;
  instanceName: string;
  state: InstanceState;
  /** Raw health verdict when one exists. Absent while checking or disabled. */
  status?: HealthStatusKind;
  /** Human-readable cause, set only for `attention`. */
  reason?: string;
  activeUrl: string;
  responseTime?: number;
}

export interface IntegrationRow {
  kind: ServiceId;
  label: string;
  instances: ServiceInstance[];
  rows: IntegrationInstanceRow[];
  /** At least one instance has a URL. */
  configured: boolean;
  enabledCount: number;
  /** Kind-level rollup, by the precedence below. */
  state: InstanceState;
  /** Dot state for the kind row. Absent when nothing is enabled. */
  status?: HealthStatusKind;
}

/**
 * Kind rollup precedence. Deliberately worst-first, which is the OPPOSITE of
 * hooks/use-service-health.ts's best-of-any aggregate (ok > auth_failed >
 * offline). That aggregate is right for a dashboard widget, where a healthy
 * primary should keep the tile green, and wrong here, where the whole point is
 * to surface the broken secondary.
 */
const STATE_PRECEDENCE: InstanceState[] = [
  "attention",
  "checking",
  "away",
  "ok",
];

/** True when any instance of this kind has a URL saved. */
export function isConfigured(instances: readonly ServiceInstance[]): boolean {
  return instances.some(
    (i) => i.localUrl.length > 0 || i.remoteUrl.length > 0,
  );
}

/**
 * True when an instance holds neither a URL nor a credential, i.e. it is an
 * empty slot rather than a server anyone configured.
 *
 * Two callers in the editor, and they must agree: the mount snapshot that
 * decides whether to offer the first-save dashboards sheet, and the live check
 * that decides whether backing out of a freshly added instance should delete
 * the empty row it left behind.
 */
export function isBlankInstance(
  inst: { localUrl: string; remoteUrl: string },
  secrets: { apiKey?: string; username?: string; password?: string },
  usesUserPass: boolean,
): boolean {
  const hasUrl = inst.localUrl.length > 0 || inst.remoteUrl.length > 0;
  const hasCreds = usesUserPass
    ? Boolean(secrets.username) || Boolean(secrets.password)
    : Boolean(secrets.apiKey);
  return !hasUrl && !hasCreds;
}

/** Host and port of a URL, for the "Unreachable · host:port" reason line. */
function hostLabel(url: string): string {
  if (!url) return "";
  // Cheap parse: RN's URL polyfill is present but this runs per row on render.
  const stripped = url.replace(/^[a-z]+:\/\//i, "");
  const end = stripped.search(/[/?#]/);
  return end === -1 ? stripped : stripped.slice(0, end);
}

/**
 * Classify one instance.
 *
 * `health` is that instance's entry from useServiceHealth, or undefined when
 * the first probe batch has not resolved yet.
 */
export function classifyInstance(
  kind: ServiceId,
  inst: ServiceInstance,
  health: { status: HealthStatusKind; message?: string } | undefined,
  lanBlocked: boolean,
  activeUrl: string,
): IntegrationInstanceRow {
  const base = { kind, instanceId: inst.id, instanceName: inst.name, activeUrl };

  const hasUrl = inst.localUrl.length > 0 || inst.remoteUrl.length > 0;

  if (!inst.enabled) {
    return { ...base, state: hasUrl ? "off" : "unconfigured" };
  }

  // Enabled with nothing to talk to is a real misconfiguration, and the health
  // hook has no verdict for it, so catch it before reading `health`.
  if (!hasUrl) {
    return {
      ...base,
      state: "attention",
      reason: "Enabled but no URL set",
    };
  }

  // Off the home network with a LAN-only URL. Not broken, just out of reach.
  if (lanBlocked) {
    return { ...base, state: "away" };
  }

  if (!health) {
    return { ...base, state: "checking" };
  }

  if (health.status === "ok") {
    return { ...base, state: "ok", status: "ok" };
  }

  const host = hostLabel(activeUrl);
  return {
    ...base,
    state: "attention",
    status: health.status,
    reason:
      health.status === "auth_failed"
        ? "Authentication failed"
        : host
          ? `Unreachable · ${host}`
          : "Unreachable",
  };
}

function rollUp(rows: IntegrationInstanceRow[]): InstanceState | undefined {
  for (const state of STATE_PRECEDENCE) {
    if (rows.some((r) => r.state === state)) return state;
  }
  return undefined;
}

/** Build one row per service kind, in canonical SERVICE_IDS order. */
export function buildIntegrationRows(
  serviceInstances: Record<ServiceId, ServiceInstance[]>,
  healthData: ServiceHealthStatus[] | undefined,
  context: Record<string, InstanceProbeContext>,
): IntegrationRow[] {
  return SERVICE_IDS.map((kind) => {
    const instances = serviceInstances[kind] ?? [];
    const healthForKind = healthData?.find((h) => h.id === kind);

    const rows = instances.map((inst) => {
      const ctx = context[inst.id];
      const health = healthForKind?.instances.find(
        (i) => i.instanceId === inst.id,
      );

      // A kind whose probe body threw settles as
      // { status: "offline", instances: [] } — see the allSettled fallback in
      // hooks/use-service-health.ts. That is a real verdict, not a pending one,
      // so fall back to the kind status instead of reporting "checking"
      // forever and hiding the failure from "Needs attention".
      //
      // Scoped to the empty-instances shape on purpose: a NON-empty list that
      // simply lacks this instance means the row was added after the probe was
      // keyed, which is genuinely still pending.
      const settledKindFallback =
        healthForKind && healthForKind.instances.length === 0
          ? { status: healthForKind.status }
          : undefined;

      const row = classifyInstance(
        kind,
        inst,
        health
          ? { status: health.status, message: health.message }
          : settledKindFallback,
        ctx?.lanBlocked ?? false,
        ctx?.activeUrl ?? "",
      );
      return { ...row, responseTime: health?.responseTime };
    });

    const enabledCount = instances.filter((i) => i.enabled).length;
    const configured = isConfigured(instances);
    const enabledRows = rows.filter((r) =>
      ["attention", "checking", "away", "ok"].includes(r.state),
    );

    const state: InstanceState = !configured
      ? "unconfigured"
      : enabledCount === 0
        ? "off"
        : (rollUp(enabledRows) ?? "off");

    return {
      kind,
      label: SERVICE_DEFAULTS[kind].name,
      instances,
      rows,
      configured,
      enabledCount,
      state,
      status:
        state === "attention" || state === "ok"
          ? (rows.find((r) => r.state === state)?.status ??
            (state === "ok" ? "ok" : "offline"))
          : undefined,
    };
  });
}

export interface IntegrationSummary {
  connected: number;
  attention: number;
  away: number;
  checking: number;
  off: number;
  available: number;
  /** Worst dot to show next to the Settings row. */
  worst?: HealthStatusKind;
  line: string;
}

/**
 * Counts for the Settings row subtitle and the hub summary line.
 *
 * Every kind lands in exactly one bucket, so
 *   connected + attention + away + checking + off + available === SERVICE_IDS.length
 * for any store shape. The test asserts it.
 */
export function summarizeIntegrations(
  rows: readonly IntegrationRow[],
): IntegrationSummary {
  let connected = 0;
  let attention = 0;
  let away = 0;
  let checking = 0;
  let off = 0;
  let available = 0;

  for (const row of rows) {
    switch (row.state) {
      case "ok":
        connected++;
        break;
      case "attention":
        attention++;
        break;
      case "away":
        away++;
        break;
      case "checking":
        checking++;
        break;
      case "off":
        off++;
        break;
      default:
        available++;
    }
  }

  const anyAuthFailed = rows.some(
    (r) => r.state === "attention" && r.status === "auth_failed",
  );

  // Configured kinds that are up right now, for the headline number.
  const live = connected + attention + away + checking;

  let line: string;
  if (live === 0 && off === 0) {
    line = "Set up your first service";
  } else if (checking > 0 && connected === 0 && attention === 0) {
    line = `Checking ${live} service${live === 1 ? "" : "s"}…`;
  } else if (attention > 0) {
    line = `${connected} connected · ${attention} need${attention === 1 ? "s" : ""} attention`;
  } else if (away > 0) {
    line = `${connected} connected · ${away} away from home`;
  } else {
    line = `${connected} service${connected === 1 ? "" : "s"} connected`;
  }

  return {
    connected,
    attention,
    away,
    checking,
    off,
    available,
    worst:
      attention > 0 ? (anyAuthFailed ? "auth_failed" : "offline") : undefined,
    line,
  };
}

/** Subtitle and tone for a kind row on the hub. */
export function integrationSubtitle(row: IntegrationRow): {
  text: string;
  tone: "default" | "warn";
} {
  if (!row.configured) return { text: "Not set up", tone: "default" };
  if (row.enabledCount === 0)
    return { text: "Configured, turned off", tone: "default" };

  if (row.instances.length === 1) {
    const only = row.rows[0];
    if (only.state === "away")
      return { text: "Local only · away from home", tone: "default" };
    if (only.state === "attention")
      return { text: only.reason ?? "Needs attention", tone: "warn" };
    if (only.state === "checking")
      return { text: only.activeUrl || "Checking…", tone: "default" };
    const ms = only.responseTime ? ` · ${Math.round(only.responseTime)} ms` : "";
    return { text: `${only.activeUrl}${ms}`, tone: "default" };
  }

  const bad = row.rows.filter((r) => r.state === "attention").length;
  const ok = row.rows.filter((r) => r.state === "ok").length;
  const plural = `${row.instances.length} instances`;
  if (bad > 0)
    return {
      text: `${plural} · ${bad} need${bad === 1 ? "s" : ""} attention`,
      tone: "warn",
    };
  return { text: `${plural} · ${ok} connected`, tone: "default" };
}

/**
 * Where tapping a kind should go.
 *
 * A single instance skips the list level entirely, which is the normal case
 * because defaultInstances() seeds exactly one placeholder per kind. That
 * keeps "open Radarr's settings" at the same tap count as the old in-place
 * settings screen despite the extra route level.
 */
export function resolveKindRoute(
  kind: ServiceId,
  instances: readonly ServiceInstance[],
): string {
  if (instances.length === 1) {
    return `/settings/integrations/${kind}/${instances[0].id}`;
  }
  return `/settings/integrations/${kind}`;
}

/** The instance list for a kind. */
export function kindListRoute(kind: ServiceId): string {
  return `/settings/integrations/${kind}`;
}

/**
 * Where tapping a row on the Browse catalog should go.
 *
 * Deliberately different from resolveKindRoute. Browse is the ADD surface, so a
 * kind you have already set up opens its instance list, which carries "Add
 * another instance". Jumping straight into the single existing instance's
 * editor would make "add a second Radarr" unreachable, since a kind with one
 * instance never shows a list anywhere else.
 *
 * A kind you have not set up still goes straight to its seeded placeholder's
 * editor, which is the one-tap path that makes browsing worth using.
 */
export function resolveBrowseRoute(
  kind: ServiceId,
  instances: readonly ServiceInstance[],
): string {
  return isConfigured(instances)
    ? kindListRoute(kind)
    : resolveKindRoute(kind, instances);
}
