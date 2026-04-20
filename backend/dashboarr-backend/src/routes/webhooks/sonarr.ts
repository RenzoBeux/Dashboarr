import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import { checkWebhookSecret } from "./shared.js";

interface SonarrWebhookPayload {
  eventType?: string;
  series?: { id?: number; title?: string };
  episodes?: { id?: number; title?: string; seasonNumber?: number; episodeNumber?: number }[];
  downloadId?: string;
}

type WebhookReq = FastifyRequest<{ Params: { secret?: string } }>;

export async function sonarrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as SonarrWebhookPayload;
    recordWebhook("sonarr", payload);

    if (payload.eventType === "Test") {
      await dispatchPush({
        category: "sonarrDownloaded",
        title: "Sonarr webhook connected",
        body: "Test notification received successfully",
        bypassCategory: true,
      });
      return { ok: true, test: true };
    }

    if (payload.eventType === "Download" && payload.series?.title) {
      const firstEp = payload.episodes?.[0];
      let suffix = "";
      if (firstEp && firstEp.seasonNumber != null && firstEp.episodeNumber != null) {
        const ep = `S${String(firstEp.seasonNumber).padStart(2, "0")}E${String(firstEp.episodeNumber).padStart(2, "0")}`;
        const epTitle = firstEp.title ? ` - ${firstEp.title}` : "";
        suffix = ` ${ep}${epTitle}`;
      }
      const title = `${payload.series.title}${suffix}`;
      await dispatchPush({
        category: "sonarrDownloaded",
        title: "Episode downloaded",
        body: title,
        data: { type: "sonarr", seriesId: payload.series.id, episodeId: firstEp?.id },
        dedupeKey: `sonarr:webhook:${payload.downloadId ?? firstEp?.id ?? payload.series.id}`,
      });
    }

    return { ok: true };
  };

  app.post<{ Params: { secret?: string } }>("/webhooks/sonarr", handler);
  app.post<{ Params: { secret?: string } }>("/webhooks/sonarr/:secret", handler);
}
