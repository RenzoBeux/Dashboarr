import { md5 } from "@noble/hashes/legacy.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

import { randomHex } from "@/lib/random";

// Pure Navidrome/Subsonic helpers. No store, no http-client, no React — so
// lib/http-client.ts can import subsonicToken/subsonicErrorMessage for its
// connection probe without a circular import, and every rule below is testable
// without a server.
//
// All behaviour here was verified against navidrome/navidrome@master (v0.63.2),
// not inferred. The upstream file is named on each rule.

/** The Subsonic protocol version we declare. Navidrome implements 1.16.1. */
export const SUBSONIC_API_VERSION = "1.16.1";

/** The `c` (client) parameter every Subsonic request must carry. */
export const SUBSONIC_CLIENT = "Dashboarr";

/**
 * Subsonic salted-token auth: `t = md5(password + salt)`.
 *
 * server/subsonic/middlewares.go:validateCredentials recomputes exactly this
 * from the `s` we send and compares, so ANY (salt, token) pair stays valid for
 * as long as the password does — a salt generated once per instance is enough,
 * and we never have to re-derive it per request.
 *
 * Navidrome does NOT implement the OpenSubsonic `apiKey` extension (it isn't in
 * validateCredentials, and GetOpenSubsonicExtensions doesn't advertise it), so
 * this is the only credential-based auth available to us.
 */
export function subsonicToken(password: string, salt: string): string {
  return bytesToHex(md5(utf8ToBytes(password + salt)));
}

/**
 * A random hex salt. The spec puts no bound on its length; Navidrome's own web
 * UI generates 3 bytes (server/auth.go:buildAuthPayload), we take 8 for margin.
 */
export function randomSalt(): string {
  return randomHex(8);
}

// --- Response envelope -----------------------------------------------------

export interface SubsonicError {
  code: number;
  message: string;
}

export interface SubsonicEnvelope {
  status: "ok" | "failed";
  version: string;
  type?: string;
  serverVersion?: string;
  openSubsonic?: boolean;
  error?: SubsonicError;
  [key: string]: unknown;
}

export interface SubsonicBody {
  "subsonic-response"?: SubsonicEnvelope;
}

/**
 * Error thrown for a Subsonic failure envelope. Carries the numeric code so
 * callers (and the connection probe) can tell "wrong password" from "not found"
 * from "the server broke".
 */
export class SubsonicApiError extends Error {
  readonly code: number;
  constructor(code: number, message: string) {
    super(message);
    this.name = "SubsonicApiError";
    this.code = code;
  }
}

// Subsonic error codes, from the spec and echoed by
// server/subsonic/responses/responses.go.
const SUBSONIC_ERROR_MESSAGES: Record<number, string> = {
  0: "Navidrome reported a generic error",
  10: "Required parameter missing",
  20: "Client is too old for this server",
  30: "Server is too old for this client",
  40: "Wrong username or password",
  41: "Token authentication is not supported by this server",
  42: "Authentication mechanism not supported",
  43: "Conflicting authentication parameters",
  44: "Invalid API key",
  50: "This account is not allowed to do that",
  60: "Subsonic trial period expired",
  70: "Not found",
};

export function subsonicErrorMessage(code: number, fallback?: string): string {
  return SUBSONIC_ERROR_MESSAGES[code] ?? fallback ?? `Subsonic error ${code}`;
}

/**
 * Codes that mean "the credentials are wrong or not permitted", as opposed to
 * "the server is unhappy". 50 is included because a valid non-admin account
 * hitting an admin-only endpoint is still a credential problem from the user's
 * point of view.
 */
export function isSubsonicAuthError(code: number): boolean {
  return code === 40 || code === 41 || code === 42 || code === 43 || code === 44 || code === 50;
}

/**
 * Unwrap a Subsonic JSON body.
 *
 * THE trap: every Subsonic error is HTTP 200. sendResponse in
 * server/subsonic/api.go never sets a status for failures (only 429 for
 * too-many-transcodes), so serviceRequest resolves happily on a wrong password
 * and the body is the ONLY signal. Same shape as NZBHydra2's /api mount.
 */
export function assertSubsonicOk(body: unknown): SubsonicEnvelope {
  const envelope = (body as SubsonicBody | undefined)?.["subsonic-response"];
  if (!envelope) {
    throw new Error("Not a Subsonic response (no subsonic-response envelope)");
  }
  if (envelope.status === "failed") {
    const code = envelope.error?.code ?? 0;
    throw new SubsonicApiError(code, subsonicErrorMessage(code, envelope.error?.message));
  }
  return envelope;
}

export function unwrapSubsonic<T>(body: unknown, key: string): T {
  return assertSubsonicOk(body)[key] as T;
}

/** Read the envelope without requiring a payload key (ping, startScan probes). */
export function readSubsonicEnvelope(body: unknown): SubsonicEnvelope | null {
  return (body as SubsonicBody | undefined)?.["subsonic-response"] ?? null;
}

// --- Library summary -------------------------------------------------------

/**
 * One row of GET /api/library (native API, admin only). Field names and types
 * are model/library.go verbatim.
 */
export interface NavidromeLibrary {
  id: number;
  name: string;
  path: string;
  lastScanAt: string;
  lastScanStartedAt: string;
  fullScanInProgress: boolean;
  totalSongs: number;
  totalAlbums: number;
  totalArtists: number;
  totalFolders: number;
  totalFiles: number;
  totalMissingFiles: number;
  totalSize: number;
  totalDuration: number;
}

/** GET /rest/getScanStatus. Navidrome adds everything after `folderCount`. */
export interface NavidromeScanStatus {
  scanning: boolean;
  count: number;
  folderCount: number;
  lastScan?: string;
  error?: string;
  scanType?: string;
  elapsedTime?: number;
}

export interface NavidromeLibrarySummary {
  artists: number | null;
  albums: number | null;
  songs: number | null;
  /** Bytes. Only the native /api/library route reports this. */
  sizeBytes: number | null;
  /** Seconds. */
  durationSec: number | null;
  missing: number | null;
  folders: number | null;
  lastScanAt: string | null;
  scanning: boolean;
  /** Which source produced this: the admin-only native API, or Subsonic. */
  source: "library" | "scanStatus";
}

/** Timestamps Navidrome has never scanned come back as the Go zero time. */
function realTimestamp(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.startsWith("0001-01-01")) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : value;
}

/**
 * Fold GET /api/library across every library into one set of counters. This is
 * the only path that can report total size — Subsonic has no equivalent.
 */
export function summarizeLibraries(
  libraries: NavidromeLibrary[],
): NavidromeLibrarySummary {
  const summary: NavidromeLibrarySummary = {
    artists: 0,
    albums: 0,
    songs: 0,
    sizeBytes: 0,
    durationSec: 0,
    missing: 0,
    folders: 0,
    lastScanAt: null,
    scanning: false,
    source: "library",
  };
  let latest = 0;
  for (const lib of libraries) {
    summary.artists! += lib.totalArtists ?? 0;
    summary.albums! += lib.totalAlbums ?? 0;
    summary.songs! += lib.totalSongs ?? 0;
    summary.sizeBytes! += lib.totalSize ?? 0;
    summary.durationSec! += lib.totalDuration ?? 0;
    summary.missing! += lib.totalMissingFiles ?? 0;
    summary.folders! += lib.totalFolders ?? 0;
    if (lib.fullScanInProgress) summary.scanning = true;
    const scanned = realTimestamp(lib.lastScanAt);
    if (scanned) {
      const t = Date.parse(scanned);
      if (t > latest) {
        latest = t;
        summary.lastScanAt = scanned;
      }
    }
  }
  return summary;
}

/**
 * The non-admin fallback. getScanStatus is not admin-gated, so a plain account
 * still gets tracks, folders and the last-scan time. Artist and album counts
 * come from getArtists (also ungated) and are passed in; total size and the
 * missing count stay null because nothing outside /api/library reports them.
 */
export function scanStatusToSummary(
  status: NavidromeScanStatus,
  counts?: { artists: number; albums: number },
): NavidromeLibrarySummary {
  return {
    artists: counts?.artists ?? null,
    albums: counts?.albums ?? null,
    songs: status.count ?? null,
    sizeBytes: null,
    durationSec: null,
    missing: null,
    folders: status.folderCount ?? null,
    lastScanAt: realTimestamp(status.lastScan),
    scanning: !!status.scanning,
    source: "scanStatus",
  };
}
