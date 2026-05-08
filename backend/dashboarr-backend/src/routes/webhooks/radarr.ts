import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import {
  checkWebhookSecret,
  resolveWebhookInstance,
  webhookTitlePrefix,
} from "./shared.js";

/**
 * Radarr "Custom" webhook payload. We only care about the `Download` (import
 * complete) and `Grab` events — both live in `eventType`.
 *
 * Sample Download payload:
 * {
 *   eventType: "Download",
 *   movie: { id, title, year, releaseDate, ... },
 *   remoteMovie: { tmdbId, ... },
 *   movieFile: { id, quality: { quality: { name } }, relativePath, ... },
 *   isUpgrade: false,
 *   downloadClient: "qBittorrent",
 *   downloadId: "HASH"
 * }
 */
interface RadarrWebhookPayload {
  eventType?: string;
  movie?: { id?: number; title?: string; year?: number };
  movieFile?: { quality?: { quality?: { name?: string } } };
  downloadId?: string;
}

type WebhookReq = FastifyRequest<{
  Params: { secret?: string };
  Querystring: { instance?: string };
}>;

export async function radarrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as RadarrWebhookPayload;
    recordWebhook("radarr", payload);

    // Optional ?instance=<uuid> attribution — when present and matched, the
    // push title gets the instance name prefix and the dedupe key namespaces
    // by instance so two Radarrs grabbing the same release (same downloadId)
    // produce two distinct pushes instead of false-deduping each other.
    const inst = resolveWebhookInstance(request, "radarr");
    const prefix = webhookTitlePrefix(inst, "radarr");
    const dedupeNs = inst ? inst.id : "any";

    if (payload.eventType === "Test") {
      await dispatchPush({
        category: "radarrDownloaded",
        title: `${prefix}Radarr webhook connected`,
        body: "Test notification received successfully",
        bypassCategory: true,
      });
      return { ok: true, test: true };
    }

    if (payload.eventType === "Download" && payload.movie?.title) {
      const title = payload.movie.year
        ? `${payload.movie.title} (${payload.movie.year})`
        : payload.movie.title;
      await dispatchPush({
        category: "radarrDownloaded",
        title: `${prefix}Movie downloaded`,
        body: title,
        data: { type: "radarr", movieId: payload.movie.id, instanceId: inst?.id },
        dedupeKey: `radarr:webhook:${dedupeNs}:${payload.downloadId ?? payload.movie.id}`,
      });
    }

    return { ok: true };
  };

  // Preferred: secret in X-Dashboarr-Secret header (keeps it out of access logs).
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/radarr",
    handler,
  );
  // Back-compat: secret in URL path, for services that don't support custom headers.
  app.post<{ Params: { secret?: string }; Querystring: { instance?: string } }>(
    "/webhooks/radarr/:secret",
    handler,
  );
}
