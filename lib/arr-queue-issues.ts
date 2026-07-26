import type { ArrQueueStatusMessage } from "@/lib/types";

/**
 * Stuck-grab detection for the Radarr, Sonarr and Lidarr queues (issue #285).
 *
 * All three *arr APIs describe a stuck grab the same way, so this module is
 * structural: any queue record with these fields works, no per-service branch.
 *
 *   trackedDownloadStatus  ok | warning | error       — how bad it is
 *   trackedDownloadState   downloading | importPending | importBlocked |
 *                          importing | imported | failedPending | failed |
 *                          ignored                     — where it is stuck
 *   status                 the *download client's* item status, not *arr's
 *   statusMessages / errorMessage                      — why
 *
 * A blocked import is the common case, but NOT the only one this catches, which
 * is why everything user-facing says "queue issues" rather than "import issues":
 * `status` is copied straight off the download client item
 * (QueueService.cs: `trackedDownload.DownloadItem.Status`, whose enum is
 * Queued/Paused/Downloading/Completed/Failed/Warning), so a stalled torrent or a
 * client-side error surfaces here too. Both are things the user wants to act on,
 * and both are fixed by the same remove/blocklist actions.
 *
 * Verified against Radarr's Queue/QueueController.cs + TrackedDownload model and
 * mirrored on Rudarr's QueueItem.swift (`hasIssue` = trackedDownloadStatus != ok).
 */

export type ArrQueueSeverity = "warning" | "error";

/** The subset of a queue record this module needs. */
export interface ArrQueueIssueRecord {
  status?: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  statusMessages?: ArrQueueStatusMessage[];
  errorMessage?: string;
}

/**
 * `error` outranks `warning`; anything else (including `ok` and a missing
 * field, which older/partial responses do emit) is not an issue. `status` is
 * checked too because a pending release that never reached the client reports
 * its trouble there with no tracked status at all.
 */
export function queueIssueSeverity(
  item: ArrQueueIssueRecord,
): ArrQueueSeverity | null {
  const tracked = (item.trackedDownloadStatus ?? "").toLowerCase();
  const status = (item.status ?? "").toLowerCase();

  if (tracked === "error" || status === "failed") return "error";
  if (tracked === "warning" || status === "warning") return "warning";
  return null;
}

/** Worst severity in a list, or null when nothing is wrong. */
export function worstQueueSeverity(
  items: readonly { severity?: ArrQueueSeverity | null }[],
): ArrQueueSeverity | null {
  let worst: ArrQueueSeverity | null = null;
  for (const item of items) {
    if (item.severity === "error") return "error";
    if (item.severity === "warning") worst = "warning";
  }
  return worst;
}

/**
 * Short human label for the row/pill, derived from where the grab is stuck.
 * `importPending` is the interesting one: on its own it just means "waiting for
 * the client to finish", but paired with a warning/error it is the state
 * Sonarr/Radarr surface as "Import blocked" in their own queue UI.
 *
 * The cases below are the whole TrackedDownloadState enum (TrackedDownload.cs in
 * Sonarr and Radarr, QueueItem in Lidarr) minus the healthy in-flight ones —
 * there is deliberately no `importFailed`, that state does not exist upstream.
 */
export function queueStatusLabel(item: ArrQueueIssueRecord): string {
  const severity = queueIssueSeverity(item);
  const state = (item.trackedDownloadState ?? "").toLowerCase();

  switch (state) {
    case "importblocked":
      return "Import blocked";
    case "importpending":
      return severity ? "Import blocked" : "Waiting to import";
    case "failed":
    case "failedpending":
      return "Download failed";
    case "ignored":
      return "Ignored";
  }

  if (severity === "error") return "Download failed";
  if (severity === "warning") return "Download warning";
  return "Downloading";
}

/**
 * Every reason *arr gives, flattened and deduped, most important first.
 *
 * A `statusMessages` entry normally names the release in `title` and lists the
 * reasons in `messages`, but a bare reason arrives as a title with no messages
 * — so an entry contributes its messages when it has any, else its title.
 */
export function queueIssueMessages(item: ArrQueueIssueRecord): string[] {
  const out: string[] = [];
  const push = (line?: string) => {
    const trimmed = line?.trim();
    if (trimmed && !out.includes(trimmed)) out.push(trimmed);
  };

  push(item.errorMessage);
  for (const entry of item.statusMessages ?? []) {
    if (entry.messages?.length) entry.messages.forEach(push);
    else push(entry.title);
  }
  return out;
}
