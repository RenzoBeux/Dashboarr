import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import { buildSonarrGrabWebhookEvent, type WebhookGrabRelease } from "../../push/grab-format.js";
import {
  checkWebhookSecret,
  resolveWebhookInstance,
  webhookTitlePrefix,
} from "./shared.js";

// Same eventType handling as the Radarr route: `Download`, `Grab` (#464) and
// `Test`. A Grab's `episodes` lists every episode the release covers.
interface SonarrWebhookPayload {
  eventType?: string;
  series?: { id?: number; title?: string };
  episodes?: { id?: number; title?: string; seasonNumber?: number; episodeNumber?: number }[];
  // Grab only: the release sent to the download client.
  release?: WebhookGrabRelease;
  downloadId?: string;
}

type WebhookReq = FastifyRequest<{
  Params: { secret?: string };
  Querystring: { instance?: string };
}>;

export async function sonarrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as SonarrWebhookPayload;
    recordWebhook("sonarr", payload);

    const inst = resolveWebhookInstance(request, "sonarr");
    const prefix = webhookTitlePrefix(inst, "sonarr");
    const dedupeNs = inst ? inst.id : "any";

    if (payload.eventType === "Test") {
      await dispatchPush({
        category: "sonarrDownloaded",
        title: `${prefix}Sonarr webhook connected`,
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
        title: `${prefix}Episode downloaded`,
        body: title,
        data: {
          type: "sonarr",
          seriesId: payload.series.id,
          episodeId: firstEp?.id,
          instanceId: inst?.id,
        },
        dedupeKey: `sonarr:webhook:${dedupeNs}:${payload.downloadId ?? firstEp?.id ?? payload.series.id}`,
      });
    }

    if (payload.eventType === "Grab") {
      const event = buildSonarrGrabWebhookEvent(payload, inst?.id, prefix);
      if (event) await dispatchPush(event);
    }

    return { ok: true };
  };

  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/sonarr",
    handler,
  );
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/sonarr/:secret",
    handler,
  );
}
