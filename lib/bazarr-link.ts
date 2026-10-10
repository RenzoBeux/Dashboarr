import { ARR_LINK_OFF } from "@/lib/config-types";
import { hostsOf, type HostMatchable } from "@/lib/instance-host-match";

/**
 * Which Bazarr instance serves which Radarr / Sonarr instance.
 *
 * A Bazarr only manages subtitles for the one Radarr and the one Sonarr it is
 * configured against, so the movie and series pages must ask the right Bazarr
 * — or none. The link is stored per Bazarr instance
 * (`linkedRadarrInstanceId` / `linkedSonarrInstanceId`):
 *
 *   - absent         → automatic: Bazarr's own settings name the Radarr/Sonarr
 *                      it talks to, including its API key. An API key belongs
 *                      to exactly one server, so a key match identifies the
 *                      instance — unlike a hostname, which the unRAID → Glances
 *                      pairing (lib/instance-host-match.ts) can only treat as a
 *                      hint.
 *   - an instance id → set by the user; wins over detection
 *   - ARR_LINK_OFF   → switched off
 *
 * Everything here is pure; detection's network half lives in
 * services/bazarr-api.ts and the React glue in hooks/use-bazarr-link.ts.
 */

export type ArrKind = "radarr" | "sonarr";

/** What Bazarr's settings say about one of the two arrs it can talk to. */
export interface BazarrArrSide {
  enabled: boolean;
  apiKey?: string;
  host?: string;
  port?: number;
}

/** A Radarr/Sonarr instance configured in the app. */
export interface ArrCandidate extends HostMatchable {
  id: string;
  apiKey?: string;
}

/**
 * The candidate Bazarr is configured against, or null.
 *
 * The API key must match. Should several candidates share a key (one server
 * added twice, say a LAN and a VPN entry), the one whose URL also carries
 * Bazarr's port wins, then the one on Bazarr's host, then the first.
 */
export function matchArrInstance(
  side: BazarrArrSide,
  candidates: readonly ArrCandidate[],
): string | null {
  const key = side.apiKey?.trim();
  if (!side.enabled || !key) return null;

  const matches = candidates.filter((c) => c.apiKey?.trim() === key);
  if (matches.length <= 1) return matches[0]?.id ?? null;

  if (side.port) {
    const byPort = matches.filter((c) => portsOf(c).has(side.port!));
    if (byPort.length > 0) return byPort[0].id;
  }
  const host = side.host?.trim().toLowerCase();
  if (host) {
    const byHost = matches.find((c) => hostsOf(c).has(host));
    if (byHost) return byHost.id;
  }
  return matches[0].id;
}

function portsOf(c: HostMatchable): Set<number> {
  const ports = new Set<number>();
  for (const raw of [c.localUrl, c.remoteUrl]) {
    if (!raw) continue;
    try {
      const url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `http://${raw}`);
      if (url.port) ports.add(Number(url.port));
    } catch {
      // Unparseable URL: contributes no port.
    }
  }
  return ports;
}

/** "radarr:7878" — where Bazarr says it reaches the arr, for the settings card. */
export function formatArrAddress(side: BazarrArrSide): string | null {
  if (!side.enabled || !side.host) return null;
  return side.port ? `${side.host}:${side.port}` : side.host;
}

export type LinkHow =
  // Set by the user and pointing at an existing instance.
  | "manual"
  // Automatic, and detection found the instance.
  | "detected"
  // Switched off by the user.
  | "off"
  // Automatic, but nothing was detected (yet).
  | "none"
  // Set by the user, but that instance no longer exists.
  | "stale";

export interface LinkState {
  arrId: string | null;
  how: LinkHow;
}

/**
 * One Bazarr instance's effective link for one arr kind.
 *
 * @param stored     the stored field (undefined = automatic)
 * @param detected   the detection result for this kind; undefined while
 *                   detection hasn't run, null when it found nothing
 * @param arrIds     ids of the arr instances that exist right now
 */
export function resolveLinkState(
  stored: string | undefined,
  detected: string | null | undefined,
  arrIds: ReadonlySet<string>,
): LinkState {
  if (stored === ARR_LINK_OFF) return { arrId: null, how: "off" };
  if (stored !== undefined) {
    return arrIds.has(stored)
      ? { arrId: stored, how: "manual" }
      : { arrId: null, how: "stale" };
  }
  if (detected && arrIds.has(detected)) {
    return { arrId: detected, how: "detected" };
  }
  return { arrId: null, how: "none" };
}

export interface BazarrLinkEntry {
  bazarrId: string;
  state: LinkState;
}

/**
 * The Bazarr instance that serves `arrId`, or null.
 *
 * Two Bazarr instances can claim one arr (a second Bazarr pointed at the same
 * Radarr, say). A link the user set wins over a detected one; between equals,
 * instance order decides, so the answer never flips between renders.
 */
export function bazarrForArr(
  arrId: string | null | undefined,
  entries: readonly BazarrLinkEntry[],
): string | null {
  if (!arrId) return null;
  const claims = entries.filter((e) => e.state.arrId === arrId);
  const manual = claims.find((e) => e.state.how === "manual");
  return (manual ?? claims[0])?.bazarrId ?? null;
}

/**
 * Config patches for "link this Bazarr to `arrId`" picked in one Bazarr's
 * settings: the target stores the id, and any OTHER Bazarr that had the same
 * arr set by hand goes back to automatic, so the choice moves instead of
 * leaving two manual claims. (A detected claim on another Bazarr needs no
 * patch — the manual link outranks it in `bazarrForArr`.)
 */
export function moveLinkPatches(
  kind: ArrKind,
  bazarrs: readonly ({ id: string } & LinkFields)[],
  targetBazarrId: string,
  arrId: string,
): { bazarrId: string; patch: LinkFields }[] {
  const field = linkField(kind);
  const patches: { bazarrId: string; patch: LinkFields }[] = [
    { bazarrId: targetBazarrId, patch: { [field]: arrId } },
  ];
  for (const b of bazarrs) {
    if (b.id !== targetBazarrId && b[field] === arrId) {
      patches.push({ bazarrId: b.id, patch: { [field]: undefined } });
    }
  }
  return patches;
}

export interface LinkFields {
  linkedRadarrInstanceId?: string;
  linkedSonarrInstanceId?: string;
}

export function linkField(kind: ArrKind): keyof LinkFields {
  return kind === "radarr" ? "linkedRadarrInstanceId" : "linkedSonarrInstanceId";
}
