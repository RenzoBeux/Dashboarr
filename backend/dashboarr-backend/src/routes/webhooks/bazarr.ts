import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { checkWebhookSecret } from "./shared.js";

type WebhookReq = FastifyRequest<{ Params: { secret?: string } }>;

/**
 * Bazarr doesn't have a structured webhook payload like Radarr/Sonarr — it uses
 * "Custom" notification agents that just send a text body. We record the event
 * for debugging but don't dispatch a push (there's no Bazarr category in the
 * user's notification settings yet).
 */
export async function bazarrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;
    recordWebhook("bazarr", request.body ?? {});
    return { ok: true };
  };

  app.post<{ Params: { secret?: string } }>("/webhooks/bazarr", handler);
  app.post<{ Params: { secret?: string } }>("/webhooks/bazarr/:secret", handler);
}
