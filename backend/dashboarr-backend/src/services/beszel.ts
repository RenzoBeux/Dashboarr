import type { StoredServiceConfig } from "../db/repos/config.js";
import { activeBaseUrl, buildUrl } from "./http.js";

const LOGIN_TIMEOUT_MS = 15000;

export class BeszelAuthError extends Error {
  constructor(message = "Beszel rejected the configured credentials") {
    super(message);
    this.name = "BeszelAuthError";
  }
}

type BeszelCollection = "_superusers" | "users";

async function attemptLogin(
  baseUrl: string,
  collection: BeszelCollection,
  identity: string,
  password: string,
): Promise<number> {
  const url = buildUrl(baseUrl, "/api", `/collections/${collection}/auth-with-password`);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOGIN_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identity, password }),
      signal: controller.signal,
    });
    return res.status;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Beszel authenticates with a PocketBase login POST
 * (`/api/collections/{_superusers|users}/auth-with-password`), not a static
 * API key or HTTP Basic/Digest header — there is no per-request credential
 * for services/http.ts's `applyAuth` to inject, so this performs the login
 * directly rather than going through `serviceFetch`/`pingService`.
 *
 * A hub's setup-wizard admin account is normally a PocketBase superuser, but
 * a hub can also grant only a non-admin `users` account with the exact same
 * credentials — verified live that the identical credentials can validly
 * authenticate against either collection depending on the deployment. So
 * `_superusers` is tried first, and on a 400 from that specific call (the
 * "Failed to authenticate" response, not a network/5xx failure) the same
 * credentials are retried against `users` before giving up.
 *
 * Resolves on a 200 from either collection (reachable, credentials valid).
 * Throws `BeszelAuthError` when both collections answer 400 (reachable,
 * credentials rejected). Throws a plain `Error` on any other non-2xx status,
 * and lets network errors / timeouts propagate as-is — mirroring how every
 * other poller in this backend signals failure: throw, and let the scheduler
 * catch it into `lastError` (see workers/scheduler.ts). There is no separate
 * "credentials invalid" signal elsewhere in this backend (health online/
 * offline is driven independently by the generic `pingService` against
 * `SERVICE_PING_PATH.beszel`, which is anonymous and can't validate
 * credentials anyway), so a thrown error is the correct and only signal here.
 */
export async function checkBeszelAuth(config: StoredServiceConfig): Promise<void> {
  const baseUrl = activeBaseUrl(config);
  if (!baseUrl) throw new Error(`No URL configured for ${config.id}`);

  const identity = config.username ?? "";
  const password = config.password ?? "";

  const superuserStatus = await attemptLogin(baseUrl, "_superusers", identity, password);
  if (superuserStatus === 200) return;
  if (superuserStatus !== 400) {
    throw new Error(
      `Beszel HTTP ${superuserStatus} — /api/collections/_superusers/auth-with-password`,
    );
  }

  const usersStatus = await attemptLogin(baseUrl, "users", identity, password);
  if (usersStatus === 200) return;
  if (usersStatus === 400) throw new BeszelAuthError();
  throw new Error(`Beszel HTTP ${usersStatus} — /api/collections/users/auth-with-password`);
}
