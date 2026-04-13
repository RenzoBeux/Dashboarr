import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import { configPayloadSchema } from "../types.js";
import {
  replaceAllServiceConfigs,
  saveNotificationSettings,
} from "../db/repos/config.js";
import { getScheduler } from "../workers/scheduler.js";

/**
 * Config is push-only from the mobile app. There is intentionally no
 * GET /config — the app already holds the source of truth in its own store,
 * and exposing every API key / password back over HTTP would turn any bearer
 * into a secret-exfil primitive. If a diagnostic view is ever added, it must
 * redact all credential fields.
 */
export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.put("/config", { preHandler: requireBearer }, async (request, reply) => {
    const parsed = configPayloadSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_payload", issues: parsed.error.issues });
    }

    replaceAllServiceConfigs(parsed.data.services);
    saveNotificationSettings(parsed.data.notifications);

    getScheduler()?.reload();

    return { ok: true };
  });
}
