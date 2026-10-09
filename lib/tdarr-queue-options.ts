import type { TdarrGlobalSettings, TdarrQueueToggleKey } from "@/lib/types";

// Copied verbatim from the Tdarr web UI's "Sort queue by" select (its bundle's
// option list). Unknown values from a newer server fall through as raw text.
export const TDARR_QUEUE_SORTS: readonly { value: string; label: string }[] = [
  { value: "noSort", label: "No Sort" },
  { value: "sortDateOldest", label: "Oldest (Scanned)" },
  { value: "sortDateNewest", label: "Newest (Scanned)" },
  { value: "sortDateFileCreatedOldest", label: "Oldest (Created)" },
  { value: "sortDateFileCreatedNewest", label: "Newest (Created)" },
  { value: "sortDateFileModifiedOldest", label: "Oldest (Modified)" },
  { value: "sortDateFileModifiedNewest", label: "Newest (Modified)" },
  { value: "sortSizeSmallest", label: "Smallest" },
  { value: "sortSizeLargest", label: "Largest" },
  { value: "sortCodecAZ", label: "Video Codec A-Z" },
  { value: "sortCodecZA", label: "Video Codec Z-A" },
  { value: "sortAudioCodecAZ", label: "Audio Codec A-Z" },
  { value: "sortAudioCodecZA", label: "Audio Codec Z-A" },
  { value: "sortContainerAZ", label: "Container A-Z" },
  { value: "sortContainerZA", label: "Container Z-A" },
  { value: "sortFilenameAZ", label: "Filename A-Z" },
  { value: "sortFilenameZA", label: "Filename Z-A" },
  { value: "sortPathAZ", label: "Path A-Z" },
  { value: "sortPathZA", label: "Path Z-A" },
  { value: "sortBitrateSmallest", label: "Bitrate smallest" },
  { value: "sortBitrateLargest", label: "Bitrate largest" },
  { value: "sortResolutionSmallest", label: "Resolution smallest" },
  { value: "sortResolutionLargest", label: "Resolution largest" },
  { value: "sortDurationSmallest", label: "Duration smallest" },
  { value: "sortDurationLargest", label: "Duration largest" },
];

// Options for the sort Select. A value from a newer server that isn't in the
// list is kept as its own (raw) option so the current choice still shows.
export function queueSortOptions(current?: string): { value: string; label: string }[] {
  const opts = [...TDARR_QUEUE_SORTS];
  if (current && !opts.some((s) => s.value === current)) {
    opts.push({ value: current, label: current });
  }
  return opts;
}

// Pairs the web UI keeps mutually exclusive: switching one ON also sends the
// other as false. Switching one OFF sends only itself.
const EXCLUSIVE: Partial<Record<TdarrQueueToggleKey, TdarrQueueToggleKey>> = {
  alternateLibraries: "prioritiseLibraries",
  prioritiseLibraries: "alternateLibraries",
  prioritiseTranscodes: "prioritiseHealthChecks",
  prioritiseHealthChecks: "prioritiseTranscodes",
};

export function buildQueueTogglePatch(
  key: TdarrQueueToggleKey,
  on: boolean,
): Partial<TdarrGlobalSettings> {
  const patch: Partial<TdarrGlobalSettings> = { [key]: on };
  const other = EXCLUSIVE[key];
  if (on && other) patch[other] = false;
  return patch;
}

// Undo a failed write without clobbering a newer one still in flight: put back
// only the fields this patch set, and only where the cache still shows its
// value (a later toggle that changed the same field owns it now).
export function rollbackQueuePatch(
  current: TdarrGlobalSettings,
  prev: TdarrGlobalSettings,
  patch: Partial<TdarrGlobalSettings>,
): TdarrGlobalSettings {
  const next: Record<string, unknown> = { ...current };
  for (const k of Object.keys(patch) as (keyof TdarrGlobalSettings)[]) {
    if (current[k] === patch[k]) next[k] = prev[k];
  }
  return next as unknown as TdarrGlobalSettings;
}
