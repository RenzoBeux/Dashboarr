import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { checkWebhookSecret } from "./shared.js";

type WebhookReq = FastifyRequest<{ Params: { secret?: string } }>;

/**
 * Tautulli webhooks are fully user-templated via its "Script" / "Webhook"
 * notification agents. We record the raw payload so users can craft templates;
 * no default dispatch since there's no Tautulli category in
 * NotificationSettings yet.
 */
export async function tautulliWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;
    recordWebhook("tautulli", request.body ?? {});
    return { ok: true };
  };

  app.post<{ Params: { secret?: string } }>("/webhooks/tautulli", handler);
  app.post<{ Params: { secret?: string } }>("/webhooks/tautulli/:secret", handler);
}
