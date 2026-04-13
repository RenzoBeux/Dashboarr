import type { FastifyReply, FastifyRequest } from "fastify";
import { findDeviceBySecret, touchDevice } from "../db/repos/devices.js";
import type { Device } from "../db/repos/devices.js";

declare module "fastify" {
  interface FastifyRequest {
    device?: Device;
  }
}

/**
 * Authenticate a request by looking up the presented Bearer against the
 * `devices.shared_secret` column. The secret is 32 bytes of `crypto.randomBytes`
 * (~256 bits of entropy) — well beyond any practical brute-force — so plain
 * SQL equality is sufficient. We do not wrap the comparison in `timingSafeEqual`
 * because the SQLite lookup already terminates the moment a match is found or
 * not found; adding a node-level constant-time compare after the fact is dead
 * code, not a defence.
 */
export async function requireBearer(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    await reply.code(401).send({ error: "missing_bearer" });
    return;
  }
  const presented = header.slice("Bearer ".length).trim();
  if (!presented) {
    await reply.code(401).send({ error: "missing_bearer" });
    return;
  }

  const device = findDeviceBySecret(presented);
  if (!device || device.invalid) {
    await reply.code(401).send({ error: "invalid_bearer" });
    return;
  }

  touchDevice(device.id);
  request.device = device;
}
