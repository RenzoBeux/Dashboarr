import { HttpError, buildUrl, serviceRequest } from "@/lib/http-client";
import { basicAuthHeader } from "@/lib/http-auth";
import { formatStat, getPath } from "@/lib/json-path";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { useConfigStore } from "@/store/config-store";
import type {
  CustomServiceAuth,
  CustomServiceDefinition,
  CustomServiceLogin,
} from "@/lib/custom-service";

// The `custom` service kind (lib/custom-service.ts) lets a user describe an
// arbitrary JSON HTTP API instead of shipping a purpose-built integration.
// This module is the request runner for that description: it applies the
// definition's auth mode, drives an optional login exchange and caches its
// captured value, then exposes health/stat/action calls that read from the
// resulting JSON with lib/json-path.
//
// Auth (def.auth) and any active login capture are applied HERE, into the
// request options handed to serviceRequest, rather than inside
// serviceRequest's own per-kind auth branch — the definition (and the
// captured value) live per-instance on `instance.custom`, not in the
// generic ServiceSecrets every other kind shares, and building the headers
// here keeps them independently testable request-by-request. serviceRequest
// still owns the transport itself (the off-WiFi LAN guard, demo mode, the
// custom-header merge, abort composition, the auth-proxy guard) exactly like
// every other service module — see services/cleanuparr-api.ts.

export interface CustomHealthResult {
  online: boolean;
  status: "ok" | "warning" | "offline";
  version?: string;
  message?: string;
}

export interface CustomStatResult {
  label: string;
  raw: unknown;
  display: string;
  unit?: string;
}

export interface CustomActionResult {
  status: number;
  body: unknown;
}

interface BuiltRequest {
  method: string;
  headers: Record<string, string>;
  params?: Record<string, string>;
  body?: string;
}

interface BuildRequestOptions {
  method: string;
  body?: string;
  contentType?: string;
  // The currently-cached login capture value (or null when the login is
  // "cookie"-injected and relying on the platform's cookie jar rather than a
  // value we can attach ourselves — see performLogin below). Undefined when
  // there is no login step at all.
  capture?: string | null;
}

/**
 * Build the method/headers/params/body for one request against a `custom`
 * instance's definition: the primary auth mode (def.auth) plus, when given,
 * the currently-cached login capture (def.login.injectAs) — independent and
 * additive, since a service can require both (e.g. a static API key header
 * AND a session cookie from a login step).
 *
 * `path` doesn't shape the request itself (every field that could is already
 * in `opts`) but is kept in the signature so call sites read naturally next
 * to the `serviceRequest(id, path, options)` call it feeds.
 */
export function buildRequest(
  def: CustomServiceDefinition,
  _path: string,
  opts: BuildRequestOptions,
): BuiltRequest {
  const headers: Record<string, string> = {};
  const params: Record<string, string> = {};
  if (opts.contentType) headers["Content-Type"] = opts.contentType;

  applyAuth(headers, params, def.auth);
  if (opts.capture) applyCapture(headers, params, def.login, opts.capture);

  return {
    method: opts.method,
    headers,
    params: Object.keys(params).length > 0 ? params : undefined,
    body: opts.body,
  };
}

function applyAuth(
  headers: Record<string, string>,
  params: Record<string, string>,
  auth: CustomServiceAuth | undefined,
): void {
  if (!auth || auth.mode === "none") return;
  switch (auth.mode) {
    case "header":
      if (auth.headerName && auth.token) headers[auth.headerName] = auth.token;
      return;
    case "query":
      if (auth.queryParam && auth.token) params[auth.queryParam] = auth.token;
      return;
    case "basic": {
      const basic = basicAuthHeader(auth.username, auth.password);
      if (basic) headers["Authorization"] = basic;
      return;
    }
    case "bearer":
      if (auth.token) headers["Authorization"] = `Bearer ${auth.token}`;
      return;
  }
}

function applyCapture(
  headers: Record<string, string>,
  params: Record<string, string>,
  login: CustomServiceLogin | undefined,
  value: string,
): void {
  if (!login) return;
  const name = login.injectName;
  switch (login.injectAs) {
    case "header":
      if (name) headers[name] = value;
      return;
    case "query":
      if (name) params[name] = value;
      return;
    case "cookie": {
      const pair = `${name || "session"}=${value}`;
      headers["Cookie"] = headers["Cookie"] ? `${headers["Cookie"]}; ${pair}` : pair;
      return;
    }
    case "bearer":
      headers["Authorization"] = `Bearer ${value}`;
      return;
  }
}

// {{username}}/{{password}} placeholders in a login body are filled from
// auth.username/auth.password regardless of auth.mode — a "none" primary
// auth mode (no header/query/basic/bearer sent on normal requests) can still
// pair with a login step that posts credentials in its body, e.g. the
// qBittorrent-shaped `mode: "none"` + cookie login preset.
function substituteLoginBody(
  body: string | undefined,
  auth: CustomServiceAuth | undefined,
): string | undefined {
  if (!body) return body;
  const username = auth?.username ?? "";
  const password = auth?.password ?? "";
  return body.replace(/\{\{username\}\}/g, username).replace(/\{\{password\}\}/g, password);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A definition's own query-string auth param name (auth.queryParam) and any
// query-injected login capture name (login.injectName, when injectAs is
// "query") are user-defined per instance, so lib/http-client.ts's fixed
// REDACT_PARAMS list can't know about them — pass them through explicitly
// wherever this module builds its own HttpError (the login request, which
// bypasses serviceRequest — see performLogin). serviceRequest's own throw
// sites do the equivalent for the real (non-login) requests.
function customRedactParamNames(def: CustomServiceDefinition): string[] {
  const names: string[] = [];
  if (def.auth?.mode === "query" && def.auth.queryParam) names.push(def.auth.queryParam);
  if (def.login?.injectAs === "query" && def.login.injectName) names.push(def.login.injectName);
  return names;
}

const DEFAULT_LOGIN_TIMEOUT_MS = 15000;

function timeoutMsFor(def: CustomServiceDefinition): number {
  return def.timeoutSeconds ? def.timeoutSeconds * 1000 : DEFAULT_LOGIN_TIMEOUT_MS;
}

// ---- login capture cache ----------------------------------------------

interface CaptureEntry {
  // The value to inject on later requests, or null when the login succeeded
  // but there is nothing to attach ourselves — e.g. injectAs "cookie" with no
  // readable Set-Cookie (RN's fetch commonly strips it; the platform cookie
  // jar carries the session from here, same fallback qBittorrent's own
  // cookie login uses). Either way, presence in the cache means "already
  // authenticated, don't log in again yet".
  value: string | null;
  expiresAt: number;
}

const CAPTURE_TTL_MS = 10 * 60 * 1000;
const captureCache = new Map<string, CaptureEntry>();

function getCachedEntry(instanceId: string): CaptureEntry | undefined {
  const entry = captureCache.get(instanceId);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    captureCache.delete(instanceId);
    return undefined;
  }
  return entry;
}

function setCachedEntry(instanceId: string, value: string | null): void {
  captureCache.set(instanceId, { value, expiresAt: Date.now() + CAPTURE_TTL_MS });
}

function clearCachedEntry(instanceId: string): void {
  captureCache.delete(instanceId);
}

/**
 * Drop one instance's cached login capture, forcing the next request to log
 * in again. The settings editor should call this on save — an edited auth
 * mode, login step, or credential must not keep using a capture minted under
 * the old definition for up to 10 more minutes.
 */
export function clearCustomServiceCache(instanceId: string): void {
  clearCachedEntry(instanceId);
}

/** Test-only: clear every cached login capture between test cases. */
export function resetCustomServiceCache(): void {
  captureCache.clear();
}

// ---- instance resolution ------------------------------------------------

function resolveInstance(instanceId: string): {
  def: CustomServiceDefinition;
  baseUrl: string;
} {
  const store = useConfigStore.getState();
  const inst = store.getInstance("custom", instanceId);
  if (!inst) throw new Error(`Custom service instance ${instanceId} not found`);
  const baseUrl = store.getActiveUrl("custom", instanceId);
  if (!baseUrl) throw new Error(`No URL configured for custom service ${instanceId}`);
  return { def: inst.custom ?? {}, baseUrl };
}

// ---- login --------------------------------------------------------------

/**
 * Perform the definition's login exchange (if any) and cache what it
 * captures. Uses a raw fetch rather than serviceRequest because reading a
 * Set-Cookie response header — one of the two supported capture sources —
 * requires the real Response object, which serviceRequest doesn't expose
 * (see services/qbittorrent-api.ts's qbLogin for the same tradeoff, and its
 * comment on why Set-Cookie itself is not reliably readable on every
 * platform — the cookie-jar fallback below covers that).
 */
async function performLogin(
  instanceId: string,
  def: CustomServiceDefinition,
  baseUrl: string,
): Promise<string | null> {
  const login = def.login;
  if (!login) return null;

  const spec = buildRequest(def, login.path, {
    method: login.method,
    body: substituteLoginBody(login.body, def.auth),
    contentType: login.contentType,
  });

  // Merge the instance's global/custom headers (e.g. a reverse-proxy auth
  // header) same as every other login flow — skip a user-supplied Cookie so
  // it can't fight this login's own session, and layer the definition's
  // headers (auth + Content-Type) on top so THEY win a name collision,
  // mirroring services/qbittorrent-api.ts's qbLogin.
  const merged = useConfigStore.getState().getMergedHeaders("custom", instanceId);
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(merged)) {
    if (k.toLowerCase() === "cookie") continue;
    headers[k] = v;
  }
  Object.assign(headers, spec.headers);

  const url = buildUrl(baseUrl, SERVICE_DEFAULTS.custom.apiBasePath, login.path, spec.params);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMsFor(def));
  let response: Response;
  try {
    response = await fetch(url, {
      method: spec.method,
      headers,
      body: spec.body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  let captured: string | null = null;

  if (login.captureJSONPath) {
    try {
      const json = await response.clone().json();
      const value = getPath(json, login.captureJSONPath);
      if (value !== undefined && value !== null) captured = String(value);
    } catch {
      // Not JSON, or the path didn't resolve — fall through to cookie capture.
    }
  }

  if (!captured && login.captureCookie) {
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const match = setCookie.match(new RegExp(`${escapeRegExp(login.captureCookie)}=([^;]+)`));
      if (match?.[1]) captured = match[1];
    }
  }

  if (!response.ok && !captured) {
    throw new HttpError(
      response.status,
      response.statusText,
      url,
      undefined,
      customRedactParamNames(def),
    );
  }

  setCachedEntry(instanceId, captured);
  return captured;
}

async function ensureCapture(
  instanceId: string,
  def: CustomServiceDefinition,
  baseUrl: string,
): Promise<string | null> {
  if (!def.login) return null;
  const cached = getCachedEntry(instanceId);
  if (cached) return cached.value;
  return performLogin(instanceId, def, baseUrl);
}

function isAuthError(err: unknown): boolean {
  return err instanceof HttpError && (err.status === 401 || err.status === 403);
}

/**
 * Run one request against a `custom` instance, driving the login step first
 * when needed and retrying exactly once — with a fresh login — on a 401/403.
 */
async function customRequest<T>(
  instanceId: string,
  path: string,
  opts: { method: string; body?: string; contentType?: string },
): Promise<T> {
  const { def, baseUrl } = resolveInstance(instanceId);
  const capture = await ensureCapture(instanceId, def, baseUrl);
  const spec = buildRequest(def, path, { ...opts, capture });
  // Read by services/custom-api.ts's login (timeoutMsFor) too, so both the
  // login exchange and the real request honor the same per-definition
  // timeout — serviceRequest defaults this away (undefined) when unset.
  const timeout = def.timeoutSeconds ? def.timeoutSeconds * 1000 : undefined;

  try {
    return await serviceRequest<T>("custom", path, {
      method: spec.method,
      headers: spec.headers,
      params: spec.params,
      body: spec.body,
      instanceId,
      timeout,
    });
  } catch (err) {
    if (!isAuthError(err) || !def.login) throw err;
    clearCachedEntry(instanceId);
    const retryCapture = await performLogin(instanceId, def, baseUrl);
    const retrySpec = buildRequest(def, path, { ...opts, capture: retryCapture });
    return serviceRequest<T>("custom", path, {
      method: retrySpec.method,
      headers: retrySpec.headers,
      params: retrySpec.params,
      body: retrySpec.body,
      instanceId,
      timeout,
    });
  }
}

// ---- health / stats / actions --------------------------------------------

/**
 * Run the definition's health probe and classify it into a tri-state
 * status. Extracted values are always compared against okValues/warnValues
 * as case-insensitive STRINGS — a JSON boolean like AzuraCast's
 * `online: true` against `okValues: ["true"]` must match.
 */
export async function checkHealth(instanceId: string): Promise<CustomHealthResult> {
  const { def } = resolveInstance(instanceId);
  const health = def.health;
  if (!health) {
    return { online: false, status: "offline", message: "No health check configured" };
  }

  try {
    const body = await customRequest<unknown>(instanceId, health.path, {
      method: health.method,
      body: health.body,
      contentType: health.body ? "application/json" : undefined,
    });

    const okValues = (health.okValues ?? []).map((v) => v.toLowerCase());
    const warnValues = (health.warnValues ?? []).map((v) => v.toLowerCase());

    let status: CustomHealthResult["status"] = "ok";
    if (health.statusPath) {
      const statusValue = getPath(body, health.statusPath);
      if (statusValue !== undefined && statusValue !== null) {
        const statusStr = String(statusValue).toLowerCase();
        if (okValues.includes(statusStr)) status = "ok";
        else if (warnValues.includes(statusStr)) status = "warning";
        else if (okValues.length > 0 || warnValues.length > 0) status = "offline";
      } else if (okValues.length > 0 || warnValues.length > 0) {
        status = "offline";
      }
    }

    let version: string | undefined;
    if (health.versionPath) {
      const v = getPath(body, health.versionPath);
      if (v !== undefined && v !== null) version = String(v);
    }

    return { online: status !== "offline", status, version };
  } catch (err) {
    return {
      online: false,
      status: "offline",
      message: err instanceof Error ? err.message : "Request failed",
    };
  }
}

/**
 * Extract every configured stat from the same response the health probe
 * reads (a custom service describes one status/version/stats-bearing
 * endpoint, not a separate one per stat).
 */
export async function getStats(instanceId: string): Promise<CustomStatResult[]> {
  const { def } = resolveInstance(instanceId);
  const stats = def.stats ?? [];
  if (stats.length === 0) return [];

  const source = def.health;
  const body = await customRequest<unknown>(instanceId, source?.path ?? "", {
    method: source?.method ?? "GET",
    body: source?.body,
    contentType: source?.body ? "application/json" : undefined,
  });

  return stats.map((stat) => {
    const raw = getPath(body, stat.path);
    return { label: stat.label, raw, display: formatStat(raw, stat.format), unit: stat.unit };
  });
}

/** Run one configured action and report its outcome without throwing on a
 * non-2xx response — the caller (a confirm-and-run UI action) wants the
 * status/body to show, not an exception. */
export async function runAction(
  instanceId: string,
  actionId: string,
): Promise<CustomActionResult> {
  const { def } = resolveInstance(instanceId);
  const action = (def.actions ?? []).find((a) => a.id === actionId);
  if (!action) throw new Error(`Unknown action "${actionId}"`);

  try {
    const body = await customRequest<unknown>(instanceId, action.path, {
      method: action.method,
      body: action.body,
      contentType: action.body ? "application/json" : undefined,
    });
    return { status: 200, body };
  } catch (err) {
    if (err instanceof HttpError) return { status: err.status, body: err.body };
    throw err;
  }
}
