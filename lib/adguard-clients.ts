import type {
  AdguardClient,
  AdguardClientsResponse,
  AdguardDhcpLease,
  AdguardDhcpStaticLease,
  AdguardDhcpStatus,
  AdguardTopArrayEntry,
} from "@/lib/types";
import { toTopListRows } from "@/lib/adguard-normalize";

/**
 * Pure helpers that fold AdGuard Home's three views of "who is on the
 * network" into one list for the Clients screen:
 *
 *   - configured clients (`/clients`.clients): named by the user, matched
 *     by any mix of IPs, CIDRs, MACs and ClientIDs;
 *   - auto clients (`/clients`.auto_clients): discovered from /etc/hosts,
 *     rDNS, ARP or AGH's own DHCP, keyed by IP;
 *   - DHCP leases (`/dhcp/status`.leases + .static_leases), keyed by MAC
 *     and IP, which is the only source that knows a hostname AND a MAC;
 *
 * plus the query counts from `/stats`.top_clients, which are keyed by
 * whatever AGH attributed the query to (an IP, or a ClientID).
 *
 * Nothing here is written back; the merge only decides what to show.
 */

export type AdguardClientSource = "configured" | "dhcp" | "auto";

export interface AdguardClientRow {
  /** Stable list key. */
  key: string;
  name: string;
  ips: string[];
  macs: string[];
  /** CIDRs and ClientIDs from a configured client. */
  otherIds: string[];
  /** Where the row's identity primarily comes from. */
  source: AdguardClientSource;
  /** For auto clients: what discovered it ("etc/hosts", "rDNS", "ARP", "DHCP"). */
  discoveredBy?: string;
  lease?: {
    ip: string;
    mac: string;
    hostname: string;
    /** ISO 8601; absent on a static lease. */
    expires?: string;
    static: boolean;
  };
  /** Queries in the stats window attributed to any of this row's ids. */
  queries?: number;
  /** The configured record, for per-client settings. */
  configured?: AdguardClient;
}

const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_RE = /^[0-9a-f:]+:[0-9a-f:]*(%[a-z0-9]+)?$/i;
const MAC_RE = /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i;
const CIDR_RE = /^[0-9a-f.:]+\/\d{1,3}$/i;

export type AdguardClientIdKind = "ip" | "mac" | "cidr" | "clientid";

/** AGH accepts four id shapes in one list; this is how the app tells them apart. */
export function classifyClientId(id: string): AdguardClientIdKind {
  const value = id.trim();
  if (MAC_RE.test(value)) return "mac";
  if (CIDR_RE.test(value)) return "cidr";
  if (IPV4_RE.test(value) || IPV6_RE.test(value)) return "ip";
  return "clientid";
}

function normId(id: string): string {
  return id.trim().toLowerCase();
}

/**
 * "expires in 3h 12m", "expires in 2d", or "expired" — for a dynamic
 * lease's `expires`. Static leases never expire and return null.
 */
export function formatLeaseExpiry(expires: string | undefined, now: number = Date.now()): string | null {
  if (!expires) return null;
  const at = Date.parse(expires);
  if (!Number.isFinite(at)) return null;
  const ms = at - now;
  if (ms <= 0) return "expired";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `expires in ${Math.max(1, minutes)}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) {
    const rem = minutes % 60;
    return rem > 0 ? `expires in ${hours}h ${rem}m` : `expires in ${hours}h`;
  }
  return `expires in ${Math.floor(hours / 24)}d`;
}

export interface MergeClientsInput {
  clients?: AdguardClientsResponse | undefined;
  dhcp?: AdguardDhcpStatus | undefined;
  topClients?: readonly AdguardTopArrayEntry[] | undefined;
}

/**
 * Build the row list. Precedence for identity: configured > DHCP lease >
 * auto client > a bare IP that only appears in the stats. A lease or auto
 * client whose IP/MAC belongs to a configured client is folded INTO that
 * row rather than listed again. Rows are sorted by query count (unknown
 * last), then name.
 */
export function mergeClientRows(input: MergeClientsInput): AdguardClientRow[] {
  const configured = input.clients?.clients ?? [];
  const auto = input.clients?.auto_clients ?? [];
  const dynamicLeases = input.dhcp?.leases ?? [];
  const staticLeases = input.dhcp?.static_leases ?? [];
  const counts = new Map<string, number>();
  for (const { title, count } of toTopListRows(input.topClients)) {
    counts.set(normId(title), (counts.get(normId(title)) ?? 0) + count);
  }

  const rows: AdguardClientRow[] = [];
  // Every id (ip/mac/clientid) already represented by a row, so later
  // sources fold in instead of duplicating.
  const claimed = new Map<string, AdguardClientRow>();
  const claim = (row: AdguardClientRow, ids: readonly string[]) => {
    for (const id of ids) {
      const n = normId(id);
      if (n && !claimed.has(n)) claimed.set(n, row);
    }
  };
  const leaseFor = (ids: readonly string[]) => {
    const wanted = new Set(ids.map(normId));
    for (const l of staticLeases) {
      if (wanted.has(normId(l.ip)) || wanted.has(normId(l.mac))) return { lease: l, isStatic: true };
    }
    for (const l of dynamicLeases) {
      if (wanted.has(normId(l.ip)) || wanted.has(normId(l.mac))) return { lease: l, isStatic: false };
    }
    return null;
  };
  const attachLease = (
    row: AdguardClientRow,
    lease: AdguardDhcpLease | AdguardDhcpStaticLease,
    isStatic: boolean,
  ) => {
    row.lease = {
      ip: lease.ip,
      mac: lease.mac,
      hostname: lease.hostname,
      expires: isStatic ? undefined : (lease as AdguardDhcpLease).expires,
      static: isStatic,
    };
    if (!row.ips.some((ip) => normId(ip) === normId(lease.ip))) row.ips.push(lease.ip);
    if (!row.macs.some((m) => normId(m) === normId(lease.mac))) row.macs.push(lease.mac);
    claim(row, [lease.ip, lease.mac]);
  };
  const sumQueries = (row: AdguardClientRow): number | undefined => {
    let total: number | undefined;
    const keys = [...row.ips, ...row.otherIds, row.name];
    for (const k of keys) {
      const c = counts.get(normId(k));
      if (c !== undefined) total = (total ?? 0) + c;
    }
    return total;
  };

  for (const c of configured) {
    const row: AdguardClientRow = {
      key: `configured:${c.name}`,
      name: c.name,
      ips: [],
      macs: [],
      otherIds: [],
      source: "configured",
      configured: c,
    };
    for (const id of c.ids ?? []) {
      const kind = classifyClientId(id);
      if (kind === "ip") row.ips.push(id);
      else if (kind === "mac") row.macs.push(id);
      else row.otherIds.push(id);
    }
    claim(row, c.ids ?? []);
    const found = leaseFor([...row.ips, ...row.macs]);
    if (found) attachLease(row, found.lease, found.isStatic);
    rows.push(row);
  }

  const leases: { lease: AdguardDhcpLease | AdguardDhcpStaticLease; isStatic: boolean }[] = [
    ...staticLeases.map((lease) => ({ lease, isStatic: true })),
    ...dynamicLeases.map((lease) => ({ lease, isStatic: false })),
  ];
  for (const { lease, isStatic } of leases) {
    const existing = claimed.get(normId(lease.ip)) ?? claimed.get(normId(lease.mac));
    if (existing) {
      // A configured client matched by one id can still be missing the
      // lease's other id (e.g. configured by MAC, lease carries the IP).
      if (!existing.lease) attachLease(existing, lease, isStatic);
      continue;
    }
    const row: AdguardClientRow = {
      key: `dhcp:${lease.mac || lease.ip}`,
      name: lease.hostname || lease.ip,
      ips: [],
      macs: [],
      otherIds: [],
      source: "dhcp",
    };
    attachLease(row, lease, isStatic);
    rows.push(row);
  }

  for (const a of auto) {
    const existing = claimed.get(normId(a.ip));
    if (existing) {
      if (existing.source === "dhcp" && !existing.lease?.hostname && a.name) existing.name = a.name;
      if (!existing.discoveredBy) existing.discoveredBy = a.source;
      continue;
    }
    const row: AdguardClientRow = {
      key: `auto:${a.ip}`,
      name: a.name || a.ip,
      ips: [a.ip],
      macs: [],
      otherIds: [],
      source: "auto",
      discoveredBy: a.source,
    };
    claim(row, [a.ip]);
    rows.push(row);
  }

  for (const [id, count] of counts) {
    if (claimed.has(id)) continue;
    const isIp = classifyClientId(id) === "ip";
    const row: AdguardClientRow = {
      key: `stats:${id}`,
      name: id,
      ips: isIp ? [id] : [],
      macs: [],
      otherIds: isIp ? [] : [id],
      source: "auto",
      queries: count,
    };
    claim(row, [id]);
    rows.push(row);
  }

  for (const row of rows) {
    if (row.queries === undefined) row.queries = sumQueries(row);
  }

  rows.sort((a, b) => {
    const qa = a.queries ?? -1;
    const qb = b.queries ?? -1;
    if (qa !== qb) return qb - qa;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true });
  });
  return rows;
}

/** Case-insensitive match on name, any ip/mac/other id, or lease hostname. */
export function clientRowMatches(row: AdguardClientRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (row.name.toLowerCase().includes(q)) return true;
  if (row.lease?.hostname.toLowerCase().includes(q)) return true;
  return [...row.ips, ...row.macs, ...row.otherIds].some((id) => id.toLowerCase().includes(q));
}

export function countBySource(rows: readonly AdguardClientRow[]): Record<AdguardClientSource, number> {
  const out: Record<AdguardClientSource, number> = { configured: 0, dhcp: 0, auto: 0 };
  for (const r of rows) out[r.source] += 1;
  return out;
}
