import { hostOf } from "@/lib/url-validation";

/**
 * Pairing two instances of different kinds that run on the same machine.
 *
 * Needed whenever one service's data is rendered against another's — today the
 * unRAID disk rows showing Glances' per-device I/O. Both kinds resolve their
 * active instance independently, so in a multi-server setup (two houses, a NAS
 * plus a VPS) the active Glances can easily be a different box than the active
 * unRAID. Device names like `sda` are near-universal, so an unguarded join
 * silently attributes one machine's disk activity to another's drives.
 *
 * Matching is by hostname across BOTH of an instance's URLs, mirroring
 * seerrSessionHostConflict in lib/seerr-auth.ts. Checking both matters: a
 * reverse-proxy user may reach the two services at unraid.example.com and
 * glances.example.com (no match) while their local URLs are both 192.168.1.10
 * (match). Ports are ignored — one host runs unRAID on :80 and Glances on
 * :61208.
 *
 * This fails closed. An unmatched pair renders nothing, which is the honest
 * outcome: wrong numbers on the wrong drives are worse than no numbers.
 */

export interface HostMatchable {
  localUrl: string;
  remoteUrl: string;
}

/** Every non-empty hostname an instance is reachable at. */
export function hostsOf(inst: HostMatchable | undefined): Set<string> {
  const hosts = new Set<string>();
  if (!inst) return hosts;
  for (const url of [inst.localUrl, inst.remoteUrl]) {
    const host = hostOf(url ?? "");
    if (host.length > 0) hosts.add(host);
  }
  return hosts;
}

/**
 * The first candidate sharing a hostname with `target`, or undefined. Returns
 * undefined when either side has no usable URL, so a half-configured instance
 * never matches everything.
 */
export function findSameHostInstance<T extends HostMatchable>(
  target: HostMatchable | undefined,
  candidates: readonly T[],
): T | undefined {
  const hosts = hostsOf(target);
  if (hosts.size === 0) return undefined;
  return candidates.find((c) => {
    for (const host of hostsOf(c)) {
      if (hosts.has(host)) return true;
    }
    return false;
  });
}
