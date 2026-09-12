import { serviceRequest, HttpError } from "@/lib/http-client";
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
//   - GET /api/app/status and /api/collections/media/count answer with a
//     text/html content type: upstream returns a JSON.stringify'd string (a
//     bare number for the count), which Express res.send stamps as text/html.
//     Both pass allowTextBody so the transport does not mistake the payload for
//     a proxy login page; the status body is single-encoded JSON that
//     parseVersionStatus parses.
// Per-instance routing: every function takes an optional `instanceId`. When
// omitted, the user's active Maintainerr instance is used.

export async function getHealth(instanceId?: string): Promise<MaintainerrHealth> {
  try {
    return await serviceRequest<MaintainerrHealth>("maintainerr", "/api/health", { instanceId });
  } catch (err) {
    // GET /api/health mirrors upstream /ready, which throws HttpException(body,
    // 503) when the database is unreachable, exactly the state this call exists
    // to surface. The 503 body IS the degraded HealthResponse, so return it
    // rather than let the query reject (which would leave the banner dead).
    if (err instanceof HttpError && err.status === 503 && isMaintainerrHealth(err.body)) {
      return err.body;
    }
    throw err;
  }
}

function isMaintainerrHealth(body: unknown): body is MaintainerrHealth {
  if (typeof body !== "object" || body === null) return false;
  // Require both fields to be strings, not merely present, so a proxy's JSON
  // error body cannot be mistaken for a health payload just by carrying the keys.
  const b = body as Record<string, unknown>;
  return typeof b.status === "string" && typeof b.database === "string";
}

export async function getVersion(instanceId?: string): Promise<MaintainerrVersion> {
  const raw = await serviceRequest<MaintainerrVersion | string>(
    "maintainerr",
    "/api/app/status",
    { instanceId, allowTextBody: true },
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
export async function getMediaCount(collectionId?: number, instanceId?: string): Promise<number> {
  const raw = await serviceRequest<number | string>("maintainerr", "/api/collections/media/count", {
    params: collectionId != null ? { collectionId } : undefined,
    instanceId,
    allowTextBody: true,
  });
  // A bare number goes through Express res.send as a text/html string ("42"),
  // so allowTextBody hands it back as a string; coerce it to the number.
  return typeof raw === "string" ? Number(raw) : raw;
}

// --- Pure helpers (unit-tested) ---

/**
 * Normalizes GET /api/app/status. Upstream returns JSON.stringify(status) with a
 * text/html content type, so the transport (allowTextBody) hands us the raw
 * single-encoded JSON string; parse it. If a proxied setup ever labels it
 * application/json, the transport has already parsed it, so an object is
 * returned as-is.
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
// ServarrAction.CHANGE_QUALITY_PROFILE (enum index 7) runs immediately, so
// Maintainerr clears its retention window (deleteAfterDays is null) even though
// the worker does act on the collection.
const MAINTAINERR_CHANGE_QUALITY_PROFILE = 7;

/**
 * Whether Maintainerr's worker will act on a collection's members, so its media
 * counts toward the scheduled total and the row shows an action label. True for
 * an immediate action (change quality profile, whose window is cleared) or a
 * retention window with an action other than DO_NOTHING. summarizeCollections
 * and maintainerrActionLabel both gate on this so the count and the label cannot
 * drift (the #392 review bug was exactly that drift).
 */
function maintainerrWillAct(arrAction: number, deleteAfterDays: number | null): boolean {
  if (arrAction === MAINTAINERR_CHANGE_QUALITY_PROFILE) return true;
  return deleteAfterDays != null && arrAction !== MAINTAINERR_DO_NOTHING;
}

/** Rolls a collections list into the two headline dashboard numbers. */
export function summarizeCollections(collections: MaintainerrCollection[]): {
  activeCollections: number;
  totalScheduled: number;
} {
  let activeCollections = 0;
  let totalScheduled = 0;
  for (const c of collections) {
    if (c.isActive) activeCollections += 1;
    // Only media the worker will actually act on counts as "scheduled" (same
    // predicate that decides whether the row gets an action label, so the two
    // cannot drift). Inactive collections are counted separately, not here.
    if (c.isActive && maintainerrWillAct(c.arrAction, c.deleteAfterDays)) {
      totalScheduled += c.mediaCount ?? 0;
    }
  }
  return { activeCollections, totalScheduled };
}

/** The glyph a collection row shows next to its action label. The UI maps each
 *  to a lucide icon; keeping it here (not in the component) means the icon and
 *  the wording are decided together and cannot drift apart. */
export type MaintainerrActionIcon = "delete" | "unmonitor" | "quality" | "none";

export interface MaintainerrAction {
  label: string;
  icon: MaintainerrActionIcon;
}

/**
 * Human wording (and a matching row icon) for what a collection does to its
 * members. Maintainerr's action is not always deletion (it can unmonitor,
 * change a quality profile, or do nothing), so the UI must not promise deletion
 * for every collection (#392 review). CHANGE_QUALITY_PROFILE runs immediately
 * and carries no retention window; every other acting label is "<verb> after N
 * days". When there is nothing to say (no window for the windowed actions, or
 * DO_NOTHING) it returns the neutral "No automatic action" / "none" pair, so the
 * row always has both a label and an icon that agree.
 */
export function maintainerrActionLabel(
  arrAction: number,
  deleteAfterDays: number | null,
): MaintainerrAction {
  if (!maintainerrWillAct(arrAction, deleteAfterDays)) {
    return { label: "No automatic action", icon: "none" };
  }
  // Immediate action carries no retention window (Maintainerr clears it).
  if (arrAction === MAINTAINERR_CHANGE_QUALITY_PROFILE) {
    return { label: "Changes quality profile immediately", icon: "quality" };
  }
  const days = `${deleteAfterDays} day${deleteAfterDays === 1 ? "" : "s"}`;
  // ServarrAction enum indices, from Maintainerr's contracts.
  switch (arrAction) {
    case 0: // DELETE
    case 5: // DELETE_SHOW_IF_EMPTY
      return { label: `Auto-deletes after ${days}`, icon: "delete" };
    case 1: // UNMONITOR_DELETE_ALL
    case 2: // UNMONITOR_DELETE_EXISTING
      return { label: `Unmonitors and deletes after ${days}`, icon: "delete" };
    case 3: // UNMONITOR
    case 6: // UNMONITOR_SHOW_IF_EMPTY
      return { label: `Unmonitors after ${days}`, icon: "unmonitor" };
    default:
      return { label: `Handled after ${days}`, icon: "unmonitor" };
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
