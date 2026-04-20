import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { recordWebhook } from "../../db/repos/events.js";
import { dispatchPush } from "../../push/dispatcher.js";
import { checkWebhookSecret } from "./shared.js";

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

type WebhookReq = FastifyRequest<{ Params: { secret?: string } }>;

export async function radarrWebhook(app: FastifyInstance): Promise<void> {
  const handler = async (request: WebhookReq, reply: FastifyReply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as RadarrWebhookPayload;
    recordWebhook("radarr", payload);

    if (payload.eventType === "Test") {
      await dispatchPush({
        category: "radarrDownloaded",
        title: "Radarr webhook connected",
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
        title: "Movie downloaded",
        body: title,
        data: { type: "radarr", movieId: payload.movie.id },
        dedupeKey: `radarr:webhook:${payload.downloadId ?? payload.movie.id}`,
      });
    }

    return { ok: true };
  };

  // Preferred: secret in X-Dashboarr-Secret header (keeps it out of access logs).
  app.post<{ Params: { secret?: string } }>("/webhooks/radarr", handler);
  // Back-compat: secret in URL path, for services that don't support custom headers.
  app.post<{ Params: { secret?: string } }>("/webhooks/radarr/:secret", handler);
}
