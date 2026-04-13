import type { FastifyInstance } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import { checkWebhookSecret } from "./shared.js";

interface SonarrWebhookPayload {
  eventType?: string;
  series?: { id?: number; title?: string };
  episodes?: { id?: number; title?: string; seasonNumber?: number; episodeNumber?: number }[];
  downloadId?: string;
}

export async function sonarrWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhooks/sonarr/:secret", async (request, reply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as SonarrWebhookPayload;
    recordWebhook("sonarr", payload);

    if (payload.eventType === "Test") {
      return { ok: true, test: true };
    }

    if (payload.eventType === "Download" && payload.series?.title) {
      const firstEp = payload.episodes?.[0];
      const suffix =
        firstEp && firstEp.seasonNumber != null && firstEp.episodeNumber != null
          ? ` S${String(firstEp.seasonNumber).padStart(2, "0")}E${String(firstEp.episodeNumber).padStart(2, "0")}`
          : "";
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
  });
}
