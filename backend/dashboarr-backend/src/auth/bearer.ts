import type { FastifyReply, FastifyRequest } from "fastify";
import { findDeviceBySecret, touchDevice } from "../db/repos/devices.js";
import type { Device } from "../db/repos/devices.js";

declare module "fastify" {
  interface FastifyRequest {
    device?: Device;
  }
}

export type BearerOutcome = "anonymous" | "authenticated";

/**
 * Optional-auth resolver, for routes that answer anonymous callers with a
 * reduced public projection instead of a flat 401. Currently only /health.
 *
 * Authenticates by looking up the presented Bearer against the
 * `devices.shared_secret` column. The secret is 32 bytes of `crypto.randomBytes`
 * (~256 bits of entropy) — well beyond any practical brute-force — so plain
 * SQL equality is sufficient. We do not wrap the comparison in `timingSafeEqual`
 * because the SQLite lookup already terminates the moment a match is found or
 * not found; adding a node-level constant-time compare after the fact is dead
 * code, not a defence.
 *
 * "anonymous" means the caller never tried to authenticate: no Authorization
 * header, or one using a different scheme. That second case is not hypothetical
 * — a forward-auth proxy (Authentik, Authelia) can inject its own `Basic …` on
 * the proxied request, and treating that as a failed bearer would 401 an
 * ordinary healthcheck and reproduce the confusion in issue #357.
 *
 * A `Bearer` that is empty or unknown still gets the 401: that caller MEANT to
 * authenticate and got it wrong. The app always sends a bearer, and the 401 from
 * `useBackendHealth` is the only way a rotated or wiped secret ever surfaces —
 * answering it 200 would leave the app reporting "Connected" forever with its
 * local notification fallback suppressed.
 *
 * Returns null once it has sent the 401; the caller must then return without
 * touching the reply.
 */
export async function resolveBearer(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<BearerOutcome | null> {
  const header = request.headers.authorization;
  // RFC 7235: the auth scheme is case-insensitive.
  if (!header || !/^bearer\s/i.test(header)) return "anonymous";

  const presented = header.slice(header.indexOf(" ") + 1).trim();
  if (!presented) {
    await reply.code(401).send({ error: "missing_bearer" });
    return null;
  }

  const device = findDeviceBySecret(presented);
  if (!device || device.invalid) {
    await reply.code(401).send({ error: "invalid_bearer" });
    return null;
  }

  touchDevice(device.id);
  request.device = device;
  return "authenticated";
}

/**
 * Bearer-or-nothing guard for every route that has no public projection.
 */
export async function requireBearer(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const outcome = await resolveBearer(request, reply);
  if (outcome === null) return; // 401 already sent
  if (outcome === "anonymous") {
    await reply.code(401).send({ error: "missing_bearer" });
  }
}
