import type { FastifyInstance } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { checkWebhookSecret } from "./shared.js";

/**
 * Tautulli webhooks are fully user-templated via its "Script" / "Webhook"
 * notification agents. We record the raw payload so users can craft templates;
 * no default dispatch since there's no Tautulli category in
 * NotificationSettings yet.
 */
export async function tautulliWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhooks/tautulli/:secret", async (request, reply) => {
    if (!(await checkWebhookSecret(request, reply))) return;
    recordWebhook("tautulli", request.body ?? {});
    return { ok: true };
  });
}
