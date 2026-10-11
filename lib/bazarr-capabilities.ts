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

// The first Bazarr release with each feature.
export const BAZARR_MIN_VERSION: Record<keyof BazarrCapabilities, string> = {
  extract: "1.6.1",
  translateEmbedded: "1.6.2",
  jobs: "1.5.6",
};

export function deriveBazarrCapabilities(
  version: string | null | undefined,
): BazarrCapabilities {
  return {
    extract: versionAtLeast(version, BAZARR_MIN_VERSION.extract),
    translateEmbedded: versionAtLeast(version, BAZARR_MIN_VERSION.translateEmbedded),
    jobs: versionAtLeast(version, BAZARR_MIN_VERSION.jobs),
  };
}

/**
 * Whether the gates above rest on a real version: "checking" while the status
 * call runs, "unreadable" when it failed or answered without a version.
 */
export type BazarrVersionState = "checking" | "unreadable" | "known";

export function bazarrVersionState(
  status: { bazarr_version?: string | null } | undefined,
  failed: boolean,
): BazarrVersionState {
  if (!status) return failed ? "unreadable" : "checking";
  return /^v?\d/i.test(status.bazarr_version?.trim() ?? "") ? "known" : "unreadable";
}

/** Why a version-gated feature is off, for its disabled row. */
export function versionGateNote(
  state: BazarrVersionState,
  feature: keyof BazarrCapabilities,
): string {
  if (state === "checking") return "Checking Bazarr version…";
  if (state === "unreadable") return "Couldn't read Bazarr's version";
  return `Needs Bazarr ${BAZARR_MIN_VERSION[feature]} or later`;
}
