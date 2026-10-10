import { versionAtLeast } from "@/lib/version-compare";

/**
 * Which subtitle features a Bazarr version supports, from `bazarr_version` in
 * /system/status. An unknown version (the status call failed or hasn't
 * answered yet) gets nothing optional — a hidden action is better than one
 * that fails with a 404 or 400.
 */
export interface BazarrCapabilities {
  // PATCH /subtitles action=extract: embedded track → file (1.6.1).
  extract: boolean;
  // action=translate on an embedded track via subtitles_id (1.6.2).
  translateEmbedded: boolean;
  // Searches and downloads run as background jobs, listed by /system/jobs
  // (1.5.6); before that the requests block until done.
  jobs: boolean;
}

export function deriveBazarrCapabilities(
  version: string | null | undefined,
): BazarrCapabilities {
  return {
    extract: versionAtLeast(version, "1.6.1"),
    translateEmbedded: versionAtLeast(version, "1.6.2"),
    jobs: versionAtLeast(version, "1.5.6"),
  };
}
