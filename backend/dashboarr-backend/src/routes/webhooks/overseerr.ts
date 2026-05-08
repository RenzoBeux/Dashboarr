import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import {
  checkWebhookSecret,
  resolveWebhookInstance,
  webhookTitlePrefix,
} from "./shared.js";

interface OverseerrWebhookPayload {
  notification_type?: string;
  subject?: string;
  message?: string;
  media?: { media_type?: string; tmdbId?: number };
  request?: { request_id?: number; requestedBy_username?: string };
}

type WebhookReq = FastifyRequest<{
  Params: { secret?: string };
  Querystring: { instance?: string };
}>;

export async function overseerrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as OverseerrWebhookPayload;
    recordWebhook("overseerr", payload);

    const inst = resolveWebhookInstance(request, "overseerr");
    const prefix = webhookTitlePrefix(inst, "overseerr");
    const dedupeNs = inst ? inst.id : "any";

    if (payload.notification_type === "TEST_NOTIFICATION") {
      await dispatchPush({
        category: "overseerrNewRequest",
        title: `${prefix}Seerr webhook connected`,
        body: "Test notification received successfully",
        bypassCategory: true,
      });
      return { ok: true, test: true };
    }

    if (payload.notification_type === "MEDIA_PENDING") {
      const who = payload.request?.requestedBy_username ?? "Someone";
      const what = payload.subject ?? payload.media?.media_type ?? "media";
      await dispatchPush({
        category: "overseerrNewRequest",
        title: `${prefix}New request`,
        body: `${who} requested ${what}`,
        data: {
          type: "overseerr",
          requestId: payload.request?.request_id,
          instanceId: inst?.id,
        },
        dedupeKey: `overseerr:webhook:${dedupeNs}:${payload.request?.request_id}`,
      });
    }

    return { ok: true };
  };

  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/overseerr",
    handler,
  );
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/overseerr/:secret",
    handler,
  );
}
