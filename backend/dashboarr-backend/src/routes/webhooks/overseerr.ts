import type { FastifyInstance } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import { checkWebhookSecret } from "./shared.js";

interface OverseerrWebhookPayload {
  notification_type?: string;
  subject?: string;
  message?: string;
  media?: { media_type?: string; tmdbId?: number };
  request?: { request_id?: number; requestedBy_username?: string };
}

export async function overseerrWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhooks/overseerr/:secret", async (request, reply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as OverseerrWebhookPayload;
    recordWebhook("overseerr", payload);

    if (payload.notification_type === "TEST_NOTIFICATION") {
      return { ok: true, test: true };
    }

    if (payload.notification_type === "MEDIA_PENDING") {
      const who = payload.request?.requestedBy_username ?? "Someone";
      const what = payload.subject ?? payload.media?.media_type ?? "media";
      await dispatchPush({
        category: "overseerrNewRequest",
        title: "New request",
        body: `${who} requested ${what}`,
        data: { type: "overseerr", requestId: payload.request?.request_id },
        dedupeKey: `overseerr:webhook:${payload.request?.request_id}`,
      });
    }

    return { ok: true };
  });
}
