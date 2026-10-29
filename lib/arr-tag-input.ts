import type { ArrTag } from "@/lib/types";

/**
 * *arr tag editing (issue #485), the pure half of picking and creating tags in
 * the add sheet and the Movie/Series Options sheets. Free of React so the
 * rules below stay unit-testable.
 */

// --- Creating a tag ---------------------------------------------------------

/**
 * Radarr and Sonarr's TagController validates `label` with
 * `Matches("^[a-z0-9-]+$", RegexOptions.IgnoreCase)`. Lidarr only checks
 * NotEmpty, so applying the stricter rule there is harmless. The client tests
 * the normalized (lowercased) label, so no ignore-case flag is needed here.
 */
export const TAG_LABEL_PATTERN = /^[a-z0-9-]+$/;

/**
 * TagService.Add lowercases a new label before inserting it, but looks up an
 * existing tag with an exact, case-sensitive match BEFORE lowercasing. So
 * POSTing "Anime" while "anime" exists is not guaranteed to dedupe. Lowercasing
 * on the client first makes the server's own dedupe hit.
 */
export function normalizeTagLabel(raw: string): string {
  return raw.trim().toLowerCase();
}

/** Inline validation for a normalized label; null when it is acceptable. */
export function tagLabelError(label: string): string | null {
  if (label.length === 0) return "Enter a tag name";
  if (!TAG_LABEL_PATTERN.test(label)) {
    return "Only letters, numbers and - are allowed";
  }
  return null;
}

/** Case-insensitive lookup, so typing an existing label selects that tag. */
export function findTagByLabel(
  tags: ArrTag[] | undefined,
  label: string,
): ArrTag | undefined {
  const wanted = normalizeTagLabel(label);
  return tags?.find((t) => t.label.toLowerCase() === wanted);
}

export type TagInputResolution =
  | { kind: "invalid"; error: string }
  | { kind: "existing"; tag: ArrTag }
  | { kind: "create"; label: string };

/**
 * What submitting the New tag input does: select an existing tag, create a
 * new one, or show an error. The existing-tag lookup runs before the character
 * rule because a label the rule rejects can already be on the server (Lidarr
 * only checks NotEmpty), and selecting it never POSTs.
 */
export function resolveTagInput(
  tags: ArrTag[] | undefined,
  raw: string,
): TagInputResolution {
  const label = normalizeTagLabel(raw);
  if (label.length === 0) return { kind: "invalid", error: "Enter a tag name" };
  const existing = findTagByLabel(tags, label);
  if (existing) return { kind: "existing", tag: existing };
  const error = tagLabelError(label);
  return error ? { kind: "invalid", error } : { kind: "create", label };
}

/**
 * Merge a freshly created tag into the cached tag list. An undefined list stays
 * undefined: the caller refetches instead, because seeding a one-item list into
 * a query with `staleTime: Infinity` would hide every other tag for good.
 */
export function upsertTag(
  list: ArrTag[] | undefined,
  tag: ArrTag,
): ArrTag[] | undefined {
  if (!list) return undefined;
  return list.some((t) => t.id === tag.id)
    ? list.map((t) => (t.id === tag.id ? tag : t))
    : [...list, tag];
}

/**
 * The first `errorMessage` of a FluentValidation 400 body
 * (`[{ propertyName, errorMessage, ... }]`), which getHttpErrorMessage does not
 * read because it only looks at a top-level `message`.
 */
export function validationFailureMessage(body: unknown): string | undefined {
  if (!Array.isArray(body)) return undefined;
  for (const failure of body) {
    const msg = (failure as { errorMessage?: unknown } | null)?.errorMessage;
    if (typeof msg === "string" && msg.length > 0) return msg;
  }
  return undefined;
}

// --- Selection --------------------------------------------------------------

/** Append an id unless it is already selected. */
export function addTagId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids : [...ids, id];
}

/** Toggle one id in or out of the selection. */
export function toggleTagId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((t) => t !== id) : [...ids, id];
}

/**
 * Order- and duplicate-insensitive equality, with undefined read as no tags.
 * The edit sheets use it for dirty detection, so re-saving the same set in a
 * different order is never a change.
 */
export function sameTagIds(a?: number[], b?: number[]): boolean {
  const left = new Set(a ?? []);
  const right = new Set(b ?? []);
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

// --- Summary ----------------------------------------------------------------

/** Labels shown before the +N count in the Options card's Tags row. */
export const TAG_SUMMARY_MAX_LABELS = 2;

/** One-line summary for the Options card: "None", "a", "a, b" or "a, b +3". */
export function formatTagSummary(labels: string[]): string {
  if (labels.length === 0) return "None";
  const shown = labels.slice(0, TAG_SUMMARY_MAX_LABELS).join(", ");
  const rest = labels.length - TAG_SUMMARY_MAX_LABELS;
  return rest > 0 ? `${shown} +${rest}` : shown;
}
