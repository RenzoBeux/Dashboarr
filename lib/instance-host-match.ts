import { hostOf } from "@/lib/url-validation";

/**
 * Do two instances look like they run on the same machine?
 *
 * Used only to HINT in a picker, never to decide what to query. The unRAID →
 * Glances disk I/O pairing (#386) is stored explicitly on the instance because
 * this answer is not verifiable: one public hostname can forward different
 * ports to different machines, so a shared hostname is suggestive, not proof.
 * Acting on it alone would paint one server's disk activity onto another's
 * drives.
 *
 * Matching is by hostname across BOTH of an instance's URLs, mirroring
 * seerrSessionHostConflict in lib/seerr-auth.ts. Checking both matters: a
 * reverse-proxy user may reach the two services at unraid.example.com and
 * glances.example.com (no match) while their local URLs are both 192.168.1.10
 * (match). Ports are ignored — one host runs unRAID on :80 and Glances on
 * :61208.
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
 * True when the two instances share a hostname. False when either side has no
 * usable URL, so a half-configured instance never matches everything.
 */
export function sharesHost(
  a: HostMatchable | undefined,
  b: HostMatchable | undefined,
): boolean {
  const hosts = hostsOf(a);
  if (hosts.size === 0) return false;
  for (const host of hostsOf(b)) {
    if (hosts.has(host)) return true;
  }
  return false;
}
