import type { FastifyInstance } from "fastify";
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

export async function radarrWebhook(app: FastifyInstance): Promise<void> {
  app.post<{ Params: { secret: string } }>("/webhooks/radarr/:secret", async (request, reply) => {
    if (!(await checkWebhookSecret(request, reply))) return;

    const payload = (request.body ?? {}) as RadarrWebhookPayload;
    recordWebhook("radarr", payload);

    if (payload.eventType === "Test") {
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
  });
}
