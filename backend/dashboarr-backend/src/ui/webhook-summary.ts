/**
 * Reduces a stored webhook payload to a one-line, secret-free summary for the
 * web UI. Raw payloads are never surfaced: Radarr/Sonarr bodies carry file
 * paths, Seerr bodies carry the requester's username and free-text message,
 * Tautulli bodies are user-templated and often include viewer IPs, and
 * Tracearr bodies carry usernames, device names and locations.
 *
 * Every field is type-guarded because `payload` is whatever the sender POSTed.
 */

export interface WebhookSummary {
  eventType: string | null;
  summary: string | null;
}

const MAX_SUMMARY = 120;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function truncate(s: string): string {
  return s.length > MAX_SUMMARY ? `${s.slice(0, MAX_SUMMARY - 1)}…` : s;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function summarizeWebhookEvent(source: string, payload: unknown): WebhookSummary {
  if (!isRecord(payload)) return { eventType: null, summary: null };

  switch (source) {
    case "radarr": {
      const movie = isRecord(payload.movie) ? payload.movie : {};
      const title = str(movie.title);
      const year = num(movie.year);
      const summary = title ? (year ? `${title} (${year})` : title) : null;
      return { eventType: str(payload.eventType), summary: summary && truncate(summary) };
    }
    case "sonarr": {
      const series = isRecord(payload.series) ? payload.series : {};
      const title = str(series.title);
      if (!title) return { eventType: str(payload.eventType), summary: null };
      const first = Array.isArray(payload.episodes) && isRecord(payload.episodes[0]) ? payload.episodes[0] : null;
      let suffix = "";
      if (first) {
        const season = num(first.seasonNumber);
        const episode = num(first.episodeNumber);
        if (season !== null && episode !== null) {
          const epTitle = str(first.title);
          suffix = ` S${pad2(season)}E${pad2(episode)}${epTitle ? ` - ${epTitle}` : ""}`;
        }
      }
      return { eventType: str(payload.eventType), summary: truncate(`${title}${suffix}`) };
    }
    case "overseerr": {
      // `subject` is the media title; `message` and `request.requestedBy_username` stay private.
      const subject = str(payload.subject);
      return { eventType: str(payload.notification_type), summary: subject && truncate(subject) };
    }
    case "tracearr":
      // `data` carries usernames, devices and locations; the event name is enough.
      return { eventType: str(payload.event), summary: null };
    default:
      // bazarr and tautulli have no structured event type.
      return { eventType: null, summary: null };
  }
}
