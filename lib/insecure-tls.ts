import { setInsecureHosts } from "@/modules/insecure-tls";
import { normalizeServiceUrl } from "@/lib/url-validation";
import type { ServiceId } from "@/lib/constants";
import type { ServiceInstance } from "@/store/config-store";
import { useConfigStore } from "@/store/config-store";

// Pull the bare hostname out of a (possibly scheme-less) service URL.
// Returns null for blanks and unparseable values rather than throwing — a
// half-typed URL in the editor shouldn't crash the sync.
function hostOf(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    const host = new URL(normalizeServiceUrl(trimmed)).hostname.toLowerCase();
    return host.length > 0 ? host : null;
  } catch {
    return null;
  }
}

// Collect the set of hostnames belonging to instances the user opted into
// "ignore certificate errors". Both the local and remote URLs are included —
// either may be the active one depending on the network, and the native layer
// keys purely on hostname, so listing both keeps the bypass working after an
// auto-switch without re-syncing.
export function computeInsecureHosts(
  serviceInstances: Record<ServiceId, ServiceInstance[]>,
): string[] {
  const hosts = new Set<string>();
  for (const list of Object.values(serviceInstances)) {
    for (const inst of list) {
      if (!inst.ignoreCertErrors) continue;
      const local = hostOf(inst.localUrl);
      if (local) hosts.add(local);
      const remote = hostOf(inst.remoteUrl);
      if (remote) hosts.add(remote);
    }
  }
  return Array.from(hosts).sort();
}

// Last allowlist pushed to native, serialized — lets us skip redundant bridge
// calls when an unrelated config change fires the store subscription.
let lastSynced = "";

// Recompute the allowlist from current config and push it to the native module
// if it changed. Safe to call on every config mutation. No-ops when the native
// module is absent (Expo Go / web / pre-rebuild binary).
export function syncInsecureHosts(): void {
  const hosts = computeInsecureHosts(useConfigStore.getState().serviceInstances);
  const serialized = hosts.join(",");
  if (serialized === lastSynced) return;
  lastSynced = serialized;
  setInsecureHosts(hosts);
}
