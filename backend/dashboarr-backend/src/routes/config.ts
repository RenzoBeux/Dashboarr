import type { FastifyInstance } from "fastify";
import { requireBearer } from "../auth/bearer.js";
import {
  configPayloadSchema,
  type ServiceConfigPayload,
  type ServiceInstancePayload,
} from "../types.js";
import { saveNotificationSettings } from "../db/repos/config.js";
import { replaceAllServiceInstances } from "../db/repos/service-instance.js";
import { getScheduler } from "../workers/scheduler.js";

/**
 * Synthesizes a stable instance id for a legacy single-instance payload. The
 * prefix lets a future cleanup script find these (e.g. when collapsing a
 * stuck mixed-shape DB) and is also what the next config push from a
 * multi-instance app build will replace via replaceAllServiceInstances.
 */
function legacyInstanceId(kind: string): string {
  return `legacy-${kind}`;
}

function legacyToInstance(c: ServiceConfigPayload): ServiceInstancePayload {
  return {
    id: legacyInstanceId(c.id),
    kind: c.id,
    enabled: c.enabled,
    name: c.name,
    localUrl: c.localUrl,
    remoteUrl: c.remoteUrl,
    useRemote: c.useRemote,
    apiKey: c.apiKey,
    username: c.username,
    password: c.password,
    wolMac: c.wolMac,
    pollMs: c.pollMs,
  };
}

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

    // Prefer `instances` when present (multi-instance app build). Fall back
    // to legacy `services` so older app builds keep working after a backend
    // upgrade. If both arrive, instances wins — it's strictly more
    // expressive.
    const instances: ServiceInstancePayload[] = parsed.data.instances
      ? parsed.data.instances
      : (parsed.data.services ?? []).map(legacyToInstance);

    replaceAllServiceInstances(instances);
    saveNotificationSettings(parsed.data.notifications);

    getScheduler()?.reload();

    return { ok: true };
  });
}
