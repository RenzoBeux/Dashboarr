import { serviceRequest } from "@/lib/http-client";
import type {
  MaintainerrCollection,
  MaintainerrHealth,
  MaintainerrVersion,
} from "@/lib/types";

// Maintainerr API notes:
//   - Maintainerr ships no auth on its own API (it expects reverse-proxy
//     protection), so Dashboarr registers it as userPass + httpAuth: any
//     Basic/Digest credentials ride along, and nothing is sent on an open LAN.
//   - apiBasePath is "" (the anonymous /api/health/live ping is root-mounted),
//     so every path here carries its own /api prefix (the Cleanuparr pattern).
//   - GET /api/app/status is JSON.stringify'd upstream, so the version payload
//     can arrive double-encoded as a string; parseVersionStatus normalizes it.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Maintainerr instance is used.

export function getHealth(instanceId?: string): Promise<MaintainerrHealth> {
  return serviceRequest<MaintainerrHealth>("maintainerr", "/api/health", { instanceId });
}

export async function getVersion(instanceId?: string): Promise<MaintainerrVersion> {
  const raw = await serviceRequest<MaintainerrVersion | string>(
    "maintainerr",
    "/api/app/status",
    { instanceId },
  );
  return parseVersionStatus(raw);
}

export function getCollections(instanceId?: string): Promise<MaintainerrCollection[]> {
  return serviceRequest<MaintainerrCollection[]>("maintainerr", "/api/collections", { instanceId });
}

/**
 * Total media across all collections (all collection membership, not just the
 * scheduled subset that summarizeCollections counts), or within one collection
 * when `collectionId` is given (GET /api/collections/media/count).
 */
export function getMediaCount(collectionId?: number, instanceId?: string): Promise<number> {
  return serviceRequest<number>("maintainerr", "/api/collections/media/count", {
    params: collectionId != null ? { collectionId } : undefined,
    instanceId,
  });
}

// --- Pure helpers (unit-tested) ---

/**
 * Normalizes GET /api/app/status. Upstream JSON.stringify's the payload, so the
 * transport can hand us either the parsed object or a JSON string; parse the
 * string form, and fall back to the value as-is if it is already an object.
 */
export function parseVersionStatus(raw: MaintainerrVersion | string): MaintainerrVersion {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as MaintainerrVersion;
    } catch {
      // Not valid JSON — fall through and return the raw value below.
    }
  }
  return raw as MaintainerrVersion;
}

// Maintainerr's ServarrAction.DO_NOTHING (enum index 4): the collection keeps
// its members but the worker never deletes or unmonitors them.
const MAINTAINERR_DO_NOTHING = 4;

/** Rolls a collections list into the two headline dashboard numbers. */
export function summarizeCollections(collections: MaintainerrCollection[]): {
  activeCollections: number;
  totalScheduled: number;
} {
  let activeCollections = 0;
  let totalScheduled = 0;
  for (const c of collections) {
    if (c.isActive) activeCollections += 1;
    // Only media the worker will actually act on counts as "scheduled": an
    // active collection with a deletion window and an action other than
    // DO_NOTHING. Inactive collections, and those with no window or DO_NOTHING,
    // keep their members untouched.
    if (c.isActive && c.deleteAfterDays != null && c.arrAction !== MAINTAINERR_DO_NOTHING) {
      totalScheduled += c.mediaCount ?? 0;
    }
  }
  return { activeCollections, totalScheduled };
}

/**
 * Human wording for what a collection does to its members once the retention
 * window passes. Maintainerr's action is not always deletion (it can unmonitor,
 * change a quality profile, or do nothing), so the UI must not promise deletion
 * for every collection (#392 review). Returns null when there is nothing to
 * say: no window, or the action is DO_NOTHING.
 */
export function maintainerrActionLabel(
  arrAction: number,
  deleteAfterDays: number | null,
): string | null {
  if (deleteAfterDays == null || arrAction === MAINTAINERR_DO_NOTHING) return null;
  const days = `${deleteAfterDays} day${deleteAfterDays === 1 ? "" : "s"}`;
  // ServarrAction enum indices, from Maintainerr's contracts.
  switch (arrAction) {
    case 0: // DELETE
    case 5: // DELETE_SHOW_IF_EMPTY
      return `Auto-deletes after ${days}`;
    case 1: // UNMONITOR_DELETE_ALL
    case 2: // UNMONITOR_DELETE_EXISTING
      return `Unmonitors and deletes after ${days}`;
    case 3: // UNMONITOR
    case 6: // UNMONITOR_SHOW_IF_EMPTY
      return `Unmonitors after ${days}`;
    case 7: // CHANGE_QUALITY_PROFILE
      return `Changes quality profile after ${days}`;
    default:
      return `Handled after ${days}`;
  }
}

/** Maps a health payload to the status tone used by the dashboard dots. */
export function maintainerrHealthTone(
  health: MaintainerrHealth | null | undefined,
): "ok" | "degraded" | "down" {
  if (!health) return "down";
  if (health.status === "ok" && health.database === "ok") return "ok";
  return "degraded";
}
