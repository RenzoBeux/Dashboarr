import { DOWNLOAD_INDICATOR_COLOR } from "@/lib/arr-poster-status";

/**
 * Download-client item state → progress/indicator color, shared by every
 * torrent and usenet download surface so they stay in lockstep (issue #208).
 *
 * "downloading" reads the app's purple "downloading" cue to match Sonarr/Radarr;
 * the other states map to their conventional colors so a bar agrees with its
 * status badge/corner icon. Accepts both the torrent `StateGroup`
 * ("downloading" | "seeding" | "paused" | "errored" | "other") and the usenet
 * `UsenetStatus` ("downloading" | "paused" | "queued" | "completed" | "failed"
 * | "other"); unknown/queued states fall back to neutral blue.
 */
export function downloadStatusColor(status: string): string {
  switch (status) {
    case "downloading":
      return DOWNLOAD_INDICATOR_COLOR.downloading; // purple #a855f7
    case "seeding":
    case "completed":
      return "#22c55e"; // green — done (seeding / fully fetched)
    case "paused":
      return "#f59e0b"; // amber
    case "errored":
    case "failed":
      return "#ef4444"; // red
    default: // queued / other
      return "#3b82f6"; // blue (neutral)
  }
}
