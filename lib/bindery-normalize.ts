import type {
  BinderyDownloadState,
  BinderyListEnvelope,
} from "@/lib/types";
import type { ArrQueueSeverity } from "@/lib/arr-queue-issues";

// Pure helpers for Bindery's API quirks. Everything here is deliberately
// side-effect free so services/bindery-api.ts stays a thin request layer and
// the awkward parts are unit-testable without a server.

// Bindery's hard ceiling on `limit` for /author, /book and /history. Asking
// for more is silently clamped, so this is also the largest useful page size.
export const BINDERY_PAGE_LIMIT = 500;

/**
 * Unwraps whichever envelope a Bindery list endpoint happened to use.
 *
 * There are three live shapes plus one historical: `{items,total,limit,offset}`
 * on /author, /book and /history; `{items,partial,staleClients}` on /queue; a
 * bare array on /rootfolder, /metadataprofile, /wanted/missing and friends;
 * and `{records,totalRecords}` on nothing today, kept because /history already
 * changed shape once and that is the *arr convention it would drift toward.
 *
 * `total` falls back to the item count so callers can treat it as a real count
 * even on the bare-array endpoints, which report no total at all.
 */
export function unwrapBinderyList<T>(data: unknown): { items: T[]; total: number } {
  if (Array.isArray(data)) {
    return { items: data as T[], total: data.length };
  }
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      const items = obj.items as T[];
      return {
        items,
        total: typeof obj.total === "number" ? obj.total : items.length,
      };
    }
    if (Array.isArray(obj.records)) {
      const items = obj.records as T[];
      return {
        items,
        total:
          typeof obj.totalRecords === "number" ? obj.totalRecords : items.length,
      };
    }
  }
  // null, undefined, or an HTML error page that slipped past the JSON parse.
  return { items: [], total: 0 };
}

/**
 * Walks an offset-paginated Bindery list to completion.
 *
 * The pagination key is `offset`, never `page`. Advancing by the REQUESTED
 * limit would loop forever against a server that clamped it, so each step
 * advances by the number of items actually returned and stops as soon as a
 * page comes back short or empty. `total` is only a stop hint; a disagreement
 * between it and the accumulated length never traps the loop.
 */
export async function fetchAllBinderyPages<T>(
  fetchPage: (limit: number, offset: number) => Promise<unknown>,
  limit: number = BINDERY_PAGE_LIMIT,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // Belt-and-braces bound: a server that always returns a full page of the
  // same rows would otherwise spin. 200 pages at 500 is 100k books.
  for (let guard = 0; guard < 200; guard++) {
    const { items, total } = unwrapBinderyList<T>(await fetchPage(limit, offset));
    all.push(...items);
    if (items.length === 0) break;
    offset += items.length;
    if (all.length >= total) break;
  }
  return all;
}

export interface BinderyImageSource {
  url: string;
  remoteUrl: string;
}

/**
 * Turns Bindery's `imageUrl` into the `{ url, remoteUrl }` pair
 * hooks/use-service-image.ts consumes.
 *
 * Library records carry a RELATIVE proxy path, `<urlBase>/api/v1/images?url=
 * <encoded remote>`, where `<urlBase>` is the server's own BINDERY_URL_BASE.
 * Passing that through verbatim breaks subpath deploys: the user's configured
 * base URL already ends in `/bindery`, so prepending it would yield
 * `/bindery/bindery/api/v1/images`. So we pull the original remote out of the
 * `url=` parameter and REBUILD the path from scratch, which is correct at any
 * urlBase, and hand the decoded remote back as the fallback candidate — the
 * hook tries it automatically if the proxied fetch fails.
 *
 * Anything that is not a proxy path (a raw remote URL from a /search stub, an
 * already-relative path, an empty string) degrades instead of throwing:
 * upstream's ProxyImageURL short-circuits on empty and on a leading slash, so
 * both genuinely occur.
 */
export function binderyImageSource(
  imageUrl: string | undefined | null,
): BinderyImageSource | undefined {
  const raw = imageUrl?.trim();
  if (!raw) return undefined;

  const remote = extractProxiedRemote(raw);
  if (remote) {
    return {
      url: `/api/v1/images?url=${encodeURIComponent(remote)}`,
      remoteUrl: remote,
    };
  }
  if (/^https?:\/\//i.test(raw)) {
    // A raw remote (search stubs, /wanted/missing). Nothing to proxy through,
    // so offer it as the remote candidate only.
    return { url: "", remoteUrl: raw };
  }
  // Some other relative path. Let the hook join it to the base URL as-is.
  return { url: raw, remoteUrl: "" };
}

// Pulls the `url=` query parameter out of a Bindery image-proxy path,
// whatever prefix it carries. Returns null when this is not a proxy path or
// the parameter is missing or undecodable.
function extractProxiedRemote(raw: string): string | null {
  const match = /\/api\/v1\/images\?(.*)$/i.exec(raw);
  if (!match) return null;
  for (const pair of match[1].split("&")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq) !== "url") continue;
    try {
      const decoded = decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, "%20"));
      return decoded || null;
    } catch {
      // Malformed percent-encoding. Treat it as "not a proxy path" so the
      // caller falls back rather than rendering a broken URI.
      return null;
    }
  }
  return null;
}

// States that mean the bytes are already on disk, whatever the download client
// is currently reporting. Mirrors upstream's queueItemSizeLeft, which returns 0
// bytes remaining for exactly this set.
const BINDERY_DOWNLOAD_COMPLETE_STATES = new Set<string>([
  "completed",
  "importPending",
  "importing",
  "imported",
  "failed",
  "importFailed",
  "importBlocked",
  "importExternal",
  "importHeld",
]);

/**
 * Download progress as a 0..1 fraction.
 *
 * Bindery reports it as a 0-100 string, sometimes with a trailing "%" (its own
 * sizeLeftFromPercentage trims one before parsing), and only while a download
 * client is actively reporting — the field is absent otherwise. So a row that
 * has finished downloading and is waiting on (or stuck in) import carries no
 * percentage at all, and reading that as 0 would draw an empty bar under a
 * release that is fully downloaded. `status` resolves it the same way upstream
 * does when it has no live data.
 *
 * Anything unparseable reads as 0 rather than NaN, which would render an
 * invisible or full bar depending on the consumer.
 */
export function binderyQueueProgress(
  percentage: string | undefined,
  status?: BinderyDownloadState | string,
): number {
  const trimmed = percentage?.trim().replace(/%$/, "");
  if (!trimmed) {
    return status && BINDERY_DOWNLOAD_COMPLETE_STATES.has(status) ? 1 : 0;
  }
  const value = Number.parseFloat(trimmed);
  if (!Number.isFinite(value)) {
    return status && BINDERY_DOWNLOAD_COMPLETE_STATES.has(status) ? 1 : 0;
  }
  return Math.min(1, Math.max(0, value / 100));
}

// Download states that mean the grab is stuck and needs a human. Everything
// else is either healthy or transient.
const BINDERY_ERROR_STATES = new Set<string>([
  "failed",
  "importFailed",
  "importBlocked",
]);
const BINDERY_WARNING_STATES = new Set<string>([
  "importHeld",
  "importExternal",
]);

/**
 * Maps a Bindery download state onto the shared queue-issue severity the
 * banner and the widget already understand. Bindery has its own status
 * vocabulary, so lib/arr-queue-issues.ts (which reads *arr's
 * trackedDownloadStatus + statusMessages) cannot be reused here.
 *
 * An unrecognised state returns null on purpose: upstream ships often, and a
 * new state should not raise a false alarm on every row until we teach the app
 * about it.
 */
export function binderyQueueSeverity(
  status: BinderyDownloadState | string | undefined,
): ArrQueueSeverity | null {
  if (!status) return null;
  if (BINDERY_ERROR_STATES.has(status)) return "error";
  if (BINDERY_WARNING_STATES.has(status)) return "warning";
  return null;
}

const BINDERY_STATUS_LABELS: Record<string, string> = {
  grabbed: "Grabbed",
  downloading: "Downloading",
  completed: "Downloaded",
  importPending: "Waiting to import",
  importing: "Importing",
  imported: "Imported",
  failed: "Download failed",
  importFailed: "Import failed",
  importBlocked: "Import blocked",
  importExternal: "Imported elsewhere",
  importHeld: "Import held",
};

export function binderyQueueStatusLabel(
  status: BinderyDownloadState | string | undefined,
): string {
  if (!status) return "Downloading";
  return BINDERY_STATUS_LABELS[status] ?? "Downloading";
}

// retry-import is the only recovery action Bindery exposes for a stuck grab,
// and the server 409s it in every state but this one — so the action is gated
// here rather than surfacing the error to the user.
export function binderyCanRetryImport(
  status: BinderyDownloadState | string | undefined,
): boolean {
  return status === "importFailed";
}

// Re-exported so callers don't have to know the envelope type name.
export type { BinderyListEnvelope };
