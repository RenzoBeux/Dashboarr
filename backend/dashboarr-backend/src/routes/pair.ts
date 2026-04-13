import type { FastifyInstance } from "fastify";
import { claimPairingToken } from "../auth/pairing-tokens.js";
import { pairClaimSchema } from "../types.js";
import { createDevice } from "../db/repos/devices.js";

/**
 * Pairing flow — security model
 * -----------------------------
 * The pairing token and webhook secret are ONLY surfaced via the server
 * console at startup (see `printStartupPairing` in index.ts). We deliberately
 * do NOT expose any HTTP endpoint that mints a token, because the backend is
 * expected to run on a LAN with HTTP and anyone who could hit such an endpoint
 * would become a full-privilege paired device (with access to every service's
 * API key and to webhook-forging). Access to the container console is a
 * reasonable proxy for "owner of this deployment".
 *
 * Consequence: if the startup token expires before the user scans it,
 * regeneration requires a container restart. That's intentional.
 *
 * Only /pair/claim is exposed, and it's rate-limited by the scope in index.ts.
 */

export async function pairRoutes(app: FastifyInstance): Promise<void> {
  app.post("/pair/claim", async (request, reply) => {
    const parsed = pairClaimSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", issues: parsed.error.issues });
    }

    const ok = claimPairingToken(parsed.data.token);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_or_expired_token" });
    }

    const device = createDevice({
      expoPushToken: parsed.data.expoPushToken,
      platform: parsed.data.platform,
      appVersion: parsed.data.appVersion,
    });

    return {
      deviceId: device.id,
      sharedSecret: device.sharedSecret,
    };
  });
}
