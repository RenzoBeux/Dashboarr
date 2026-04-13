import type { FastifyInstance } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { checkWebhookSecret } from "./shared.js";

/**
 * Bazarr doesn't have a structured webhook payload like Radarr/Sonarr — it uses
 * "Custom" notification agents that just send a text body. We record the event
 * for debugging but don't dispatch a push (there's no Bazarr category in the
 * user's notification settings yet).
 */
export async function bazarrWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhooks/bazarr/:secret", async (request, reply) => {
    if (!(await checkWebhookSecret(request, reply))) return;
    recordWebhook("bazarr", request.body ?? {});
    return { ok: true };
  });
}
