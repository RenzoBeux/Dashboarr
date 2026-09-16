import { buildUrl } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoResponse } from "@/lib/demo-data";
import {
  type BeszelAuthCollection,
  dropBeszelSession,
  getBeszelToken,
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
    if (!res.ok) throw new BeszelHttpError(res.status, await res.text().catch(() => ""));
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
  headers.set("Authorization", token);

  const url = buildUrl(baseUrl, API_BASE, path, params);
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new BeszelHttpError(res.status, await res.text().catch(() => ""));
  return (await res.json()) as T;
}

/**
 * Wraps a single-page collection GET with the retry-once-on-empty backstop
 * documented in lib/beszel-session.ts: a cache-hit token whose systems query
 * comes back with zero results might be silently invalid (bad/expired tokens
 * 200 empty rather than 401ing — verified live), so force exactly one fresh
 * login and retry. A token that was ALREADY fresh returning zero is trusted.
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
    dropBeszelSession(id);
    const retry = await getBeszelToken(id, () => beszelLogin(id));
    return beszelFetch<BeszelPageResponse<T>>(id, path, params, retry.token);
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
 */
export function beszelClearSession(instanceId?: string): void {
  if (instanceId) {
    dropBeszelSession(instanceId);
    return;
  }
  const store = useConfigStore.getState();
  const ids = new Set((store.serviceInstances.beszel ?? []).map((i) => i.id));
  for (const id of ids) dropBeszelSession(id);
}
