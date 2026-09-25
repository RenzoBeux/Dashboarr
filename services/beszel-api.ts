import { buildUrl } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import {
  type BeszelAuthCollection,
  dropBeszelSession,
  forgetBeszelSession,
  getBeszelToken,
  beszelSessionIds,
  updateBeszelToken,
} from "@/lib/beszel-session";
import type {
  BeszelContainerRecord,
  BeszelSystemRecord,
  BeszelSystemStatsRecord,
} from "@/lib/types";

const API_BASE = SERVICE_DEFAULTS.beszel.apiBasePath;

function resolveBeszelInstanceId(instanceId?: string): string {
  if (instanceId) return instanceId;
  const id = useConfigStore.getState().getActiveInstanceId("beszel");
  if (!id) throw new Error("No Beszel instance configured");
  return id;
}

export class BeszelHttpError extends Error {
  constructor(
    public status: number,
    bodyText?: string,
  ) {
    super(bodyText?.trim() || `Beszel request failed: ${status}`);
    this.name = "BeszelHttpError";
  }
}

/**
 * Unlike AdGuard (whose errors are plain text, so the raw body IS the
 * message), PocketBase always answers errors with a JSON envelope
 * (`{code, message, data}`). Extract `.message` so `BeszelHttpError` shows
 * something readable instead of the raw `{"code":500,...}` blob; when the
 * envelope has no usable message, return undefined so the constructor's own
 * `Beszel request failed: ${status}` fallback kicks in instead of a bare "{}".
 */
async function beszelErrorMessage(res: Response): Promise<string | undefined> {
  const text = await res.text().catch(() => "");
  if (!text.trim()) return undefined;
  try {
    const body = JSON.parse(text) as { message?: string };
    return body?.message?.trim() || undefined;
  } catch {
    return text;
  }
}

/**
 * Thrown when neither `_superusers` nor `users` accepts the configured
 * credentials — a genuine wrong email/password, not a transient issue.
 */
export class BeszelAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BeszelAuthError";
  }
}

interface BeszelPageResponse<T> {
  page: number;
  perPage: number;
  totalItems: number;
  totalPages: number;
  items: T[];
}

/**
 * POST /api/collections/{collection}/auth-with-password. Tries `_superusers`
 * first (bypasses per-system sharing rules), falling back to `users` on a
 * 400 — see the module doc in lib/beszel-session.ts for why both are tried.
 * A 400 from BOTH is a genuine credential rejection; anything else (network
 * failure, 5xx) throws the raw error so the caller can tell them apart.
 */
export async function beszelLogin(
  instanceId?: string,
): Promise<{ token: string; authCollection: BeszelAuthCollection }> {
  const id = resolveBeszelInstanceId(instanceId);
  const store = useConfigStore.getState();
  const secrets = store.instanceSecrets[id] ?? {};
  const baseUrl = store.getActiveUrl("beszel", id);
  if (!baseUrl) throw new Error("No URL configured for Beszel");

  const attempt = async (
    collection: BeszelAuthCollection,
  ): Promise<{ token: string; authCollection: BeszelAuthCollection } | { failed: true; message: string }> => {
    const url = buildUrl(baseUrl, API_BASE, `/collections/${collection}/auth-with-password`);
    const headers = new Headers();
    const customHeaders = store.getMergedHeaders("beszel", id);
    for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);
    headers.set("Content-Type", "application/json");
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        identity: secrets.username ?? "",
        password: secrets.password ?? "",
      }),
    });
    if (res.status === 400) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { failed: true, message: body?.message ?? "Wrong email or password" };
    }
    if (!res.ok) throw new BeszelHttpError(res.status, await beszelErrorMessage(res));
    const body = (await res.json()) as { token: string };
    return { token: body.token, authCollection: collection };
  };

  const superuser = await attempt("_superusers");
  if (!("failed" in superuser)) return superuser;

  const user = await attempt("users");
  if (!("failed" in user)) return user;

  throw new BeszelAuthError(user.message);
}

async function beszelFetch<T>(
  instanceId: string,
  path: string,
  params: Record<string, string> | undefined,
  token: string,
): Promise<T> {
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("beszel", instanceId);
  if (!baseUrl) throw new Error("No URL configured for Beszel");
  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("beszel", instanceId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);
  // Raw token, no "Bearer " prefix — matches the PocketBase JS SDK's own
  // convention. Confirmed live that a "Bearer " prefix also works, so either
  // shape is accepted; sending the raw token is the documented default.
  //
  // This always wins over a caller-supplied Authorization header. Unlike
  // Jellyfin (which falls back to an `ApiKey` query param when Authorization
  // is already taken, see lib/media-server-config.ts), Beszel's PocketBase
  // API has no documented alternate credential shape — the bearer token MUST
  // go in this header, so a hub behind a Basic/Digest-auth reverse proxy that
  // also needs Authorization is unsupported: beszelLogin leaves a custom
  // header alone (so login itself appears to succeed), but every data call
  // still needs the real token here, and there is nowhere else to put it.
  headers.set("Authorization", token);

  const url = buildUrl(baseUrl, API_BASE, path, params);
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new BeszelHttpError(res.status, await beszelErrorMessage(res));
  return (await res.json()) as T;
}

/**
 * POST /api/collections/{collection}/auth-refresh — PocketBase's dedicated
 * token-validity check: 200 with a renewed token when the token is still
 * good, 404 when it is not (see `apis/record_auth_refresh.go` upstream).
 * Used by the reactive backstop below to get an unambiguous answer instead
 * of guessing from an empty list result.
 */
async function beszelAuthRefresh(
  instanceId: string,
  authCollection: BeszelAuthCollection,
  token: string,
): Promise<string | null> {
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("beszel", instanceId);
  if (!baseUrl) throw new Error("No URL configured for Beszel");
  const headers = new Headers();
  const customHeaders = store.getMergedHeaders("beszel", instanceId);
  for (const [k, v] of Object.entries(customHeaders)) headers.set(k, v);
  headers.set("Authorization", token);

  const url = buildUrl(baseUrl, API_BASE, `/collections/${authCollection}/auth-refresh`);
  const res = await fetch(url, { method: "POST", headers });
  if (res.status === 404) return null;
  if (!res.ok) throw new BeszelHttpError(res.status, await beszelErrorMessage(res));
  const body = (await res.json()) as { token: string };
  return body.token;
}

/**
 * Wraps a single-page collection GET with the reactive backstop documented
 * in lib/beszel-session.ts: a cache-hit token whose list query comes back
 * with zero results is ambiguous (a bad/expired token 200s empty rather than
 * 401ing — verified live — but zero is also a legitimate permanent state for
 * every one of these endpoints: an empty hub, a system with no Docker, a
 * system with no rollups yet). Rather than guessing from the empty result,
 * confirm the token itself via auth-refresh: only a confirmed-invalid token
 * triggers a fresh login + retry, and a confirmed-valid one keeps the empty
 * result as-is. A token that was ALREADY fresh returning zero is trusted
 * outright — it just logged in, so a second check would be redundant.
 */
async function beszelListRequest<T>(
  instanceId: string | undefined,
  path: string,
  params?: Record<string, string>,
): Promise<BeszelPageResponse<T>> {
  const id = resolveBeszelInstanceId(instanceId);
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    const items = (getDemoResponse("beszel", path, params) ?? []) as T[];
    return { page: 1, perPage: items.length, totalItems: items.length, totalPages: 1, items };
  }

  const first = await getBeszelToken(id, () => beszelLogin(id));
  const result = await beszelFetch<BeszelPageResponse<T>>(id, path, params, first.token);
  if (result.totalItems === 0 && !first.fresh) {
    const renewed = await beszelAuthRefresh(id, first.authCollection, first.token);
    if (renewed === null) {
      dropBeszelSession(id);
      const retry = await getBeszelToken(id, () => beszelLogin(id));
      return beszelFetch<BeszelPageResponse<T>>(id, path, params, retry.token);
    }
    updateBeszelToken(id, first.generation, renewed, first.authCollection);
  }
  return result;
}

/**
 * GET /api/collections/systems/records — every monitored system, with its
 * live snapshot already embedded in `info`. No per-system extra request
 * needed for the overview list.
 */
export async function getSystems(instanceId?: string): Promise<BeszelSystemRecord[]> {
  const result = await beszelListRequest<BeszelSystemRecord>(instanceId, "/collections/systems/records", {
    perPage: "200",
    sort: "name",
  });
  return result.items;
}

/**
 * GET /api/collections/system_stats/records for one system's historical
 * rollup at the given interval, most recent first.
 */
export async function getSystemStats(
  systemId: string,
  type: "1m" | "10m" | "20m" | "120m" | "480m",
  limit: number,
  instanceId?: string,
): Promise<BeszelSystemStatsRecord[]> {
  const result = await beszelListRequest<BeszelSystemStatsRecord>(
    instanceId,
    "/collections/system_stats/records",
    {
      filter: `system='${systemId}'&&type='${type}'`,
      sort: "-created",
      perPage: String(limit),
    },
  );
  return result.items;
}

/** GET /api/collections/containers/records for one system's Docker containers. */
export async function getContainers(
  systemId: string,
  instanceId?: string,
): Promise<BeszelContainerRecord[]> {
  const result = await beszelListRequest<BeszelContainerRecord>(
    instanceId,
    "/collections/containers/records",
    { filter: `system='${systemId}'`, perPage: "200" },
  );
  return result.items;
}

/**
 * Drop the cached token — call before saving new credentials and before
 * deleting an instance, mirroring adguardClearSession. With no `instanceId`,
 * clears every cached instance.
 *
 * Iterates the session cache itself (`beszelSessionIds`), not
 * `serviceInstances.beszel` — an instance being deleted is typically already
 * gone from config by the time this runs, so looking it up there would never
 * find (and never drop) its entry. `forgetBeszelSession` removes the map
 * entry outright rather than just resetting its fields, matching Pi-hole's
 * `clearSession`.
 */
export function beszelClearSession(instanceId?: string): void {
  const ids = instanceId ? [instanceId] : beszelSessionIds();
  for (const id of ids) {
    dropBeszelSession(id);
    forgetBeszelSession(id);
  }
}
