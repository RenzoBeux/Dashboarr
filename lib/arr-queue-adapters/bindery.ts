import { BookOpen } from "lucide-react-native";
import { getQueue, getWantedCount, removeFromQueue } from "@/services/bindery-api";
import {
  binderyQueueProgress,
  binderyQueueSeverity,
  binderyQueueStatusLabel,
} from "@/lib/bindery-normalize";
import type { BinderyQueueResponse } from "@/lib/types";
import type { ArrQueueAdapter } from "@/lib/arr-queue-adapter";

// Bindery's queue in the shared *arr queue-card shape. Three places where it
// necessarily diverges from the Radarr/Sonarr/Lidarr adapters:
//
//   - No artwork. Queue rows are the one Bindery payload that is never
//     image-proxied and they carry no image field at all, so posterUrl is
//     always null and the card falls back to the BookOpen icon.
//   - No shared queue-issue helpers. lib/arr-queue-issues.ts reads *arr's
//     trackedDownloadStatus + statusMessages[]; Bindery has neither, just its
//     own eleven-value status enum plus a single errorMessage string.
//   - Progress is a percentage string, not a size/sizeleft pair.
export const binderyArrQueueAdapter: ArrQueueAdapter = {
  serviceId: "bindery",
  displayName: "Bindery",
  listRoute: "/(tabs)/books",
  emptyQueueLabel: "No books in queue",
  // Amber, to sit apart from Lidarr's purple and the Radarr/Sonarr accents.
  badgeColor: "rgba(217, 119, 6, 0.9)",
  fallbackIcon: BookOpen,

  queueQueryKey: (instanceId) => ["bindery", instanceId, "queue"] as const,
  wantedQueryKey: (instanceId) => ["bindery", instanceId, "wanted"] as const,

  // Same key + args as useBinderyQueue, so the widget shares its cache entry.
  fetchQueue: (instanceId) => getQueue(instanceId),

  toItems: (data, instanceId) =>
    ((data as BinderyQueueResponse).items ?? []).map((item) => ({
      id: item.id,
      posterUrl: null,
      // `book` is a minimal projection the server attaches so a row can name
      // its book without a second fetch. It is absent on manual downloads.
      title: item.book?.title || item.title,
      subtitle:
        item.book?.authorName ??
        (item.timeLeft ? `ETA ${item.timeLeft}` : undefined),
      // Bindery has no quality concept on a queue row. The protocol is the
      // only per-release fact worth the badge slot.
      qualityLabel: item.protocol ?? "",
      progress: binderyQueueProgress(item.percentage, item.status),
      // Book ids aren't globally unique across instances, so the detail link
      // carries the source instance id.
      detailPath: item.bookId
        ? `/book/${item.bookId}?instanceId=${instanceId}`
        : null,
      releaseTitle: item.title,
      severity: binderyQueueSeverity(item.status),
      statusLabel: binderyQueueStatusLabel(item.status),
      messages: item.errorMessage ? [item.errorMessage] : [],
    })),

  // The badge only needs a count, and /book?status=wanted&limit=1 reports the
  // real total in its envelope — far cheaper than the full list the Wanted
  // chip loads under its own key.
  fetchWanted: (instanceId) => getWantedCount(instanceId),
  wantedCount: (data) => (typeof data === "number" ? data : 0),

  // Routed through bulk-delete because that is the only removal route exposing
  // `unmonitorBooks`, and it is always sent.
  //
  // On an *arr, "Remove from queue" leaves the item monitored on purpose — the
  // user still wants it, and Blocklist & Search is there to stop a specific bad
  // release coming back. Bindery has no blocklist at all (see supportsBlocklist
  // below), so leaving it monitored means the scheduler's wanted-search loop
  // re-grabs the same release within minutes and the removal appears to do
  // nothing, with no way out from inside the app.
  //
  // This is only ever reached from the queue-issues banner, which lists solely
  // grabs that are already stuck (use-arr-queue-issues.ts filters on a non-null
  // severity), so "remove and stop wanting it" is the intent every time.
  // `opts` carries nothing Bindery can act on: `blocklist` has nowhere to go,
  // and bulk-delete always tells the client to drop the job, which is what
  // every *arr does by default anyway.
  removeFromQueue: async (instanceId, queueId) => {
    await removeFromQueue([queueId], { unmonitorBooks: true }, instanceId);
  },

  // Bindery's removal routes take no blocklist flag; blocklisting needs a
  // history id, which a queue row does not expose. (The join does exist — a
  // queue item's `guid` matches the grabbed history event's `data.guid` — but
  // it costs a history scan per removal, so it is deferred rather than faked.)
  supportsBlocklist: false,

  // No forceImport: that is *arr's "import this blocked download anyway", which
  // Bindery has no equivalent of. Its only recovery action is retry-import, and
  // the server rejects that with a 409 in every state but importFailed — so it
  // is offered on the Books tab's queue rows, gated on that state, rather than
  // pretending to be a forceImport here.
};
