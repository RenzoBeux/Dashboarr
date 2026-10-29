import type {
  AdguardBlockedServiceDef,
  AdguardBlockedServicesAll,
  AdguardDayRange,
  AdguardSchedule,
} from "@/lib/types";

/**
 * Pure helpers for AdGuard Home's "Blocked services" (its built-in catalog
 * of TikTok / YouTube / Steam / … rule bundles, toggled by id).
 *
 * The catalog comes from `GET /control/blocked_services/all` with a
 * Base64 SVG per service; the current selection and its pause schedule
 * from `GET /control/blocked_services/get`. The update is whole-state (ids
 * AND schedule), which is why the hooks re-read before every write.
 */

/** Human labels for the catalog's group ids; unknown groups fall back to the id. */
export const BLOCKED_SERVICE_GROUP_LABELS: Record<string, string> = {
  ai: "AI",
  cdn: "CDN",
  dating: "Dating",
  gambling: "Gambling",
  gaming: "Gaming",
  hosting: "Hosting",
  messenger: "Messengers",
  privacy: "Privacy",
  shopping: "Shopping",
  social_network: "Social networks",
  software: "Software",
  streaming: "Streaming",
};

export function blockedServiceGroupLabel(groupId: string | undefined): string {
  if (!groupId) return "Other";
  const known = BLOCKED_SERVICE_GROUP_LABELS[groupId];
  if (known) return known;
  return groupId.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export interface BlockedServiceGroup {
  id: string;
  label: string;
  services: AdguardBlockedServiceDef[];
}

/**
 * Catalog → groups, in the server's group order with "Other" last, each
 * group's services sorted by name. A service naming a group the server did
 * not list still gets a section rather than being dropped.
 */
export function groupBlockedServices(
  all: AdguardBlockedServicesAll | undefined,
): BlockedServiceGroup[] {
  const services = all?.blocked_services ?? [];
  const order = (all?.groups ?? []).map((g) => g.id);
  const byGroup = new Map<string, AdguardBlockedServiceDef[]>();
  for (const svc of services) {
    const key = svc.group_id ?? "";
    const list = byGroup.get(key) ?? [];
    list.push(svc);
    byGroup.set(key, list);
  }
  const ids = [
    ...order.filter((id) => byGroup.has(id)),
    ...[...byGroup.keys()].filter((id) => id !== "" && !order.includes(id)).sort(),
    ...(byGroup.has("") ? [""] : []),
  ];
  return ids.map((id) => ({
    id: id || "other",
    label: blockedServiceGroupLabel(id || undefined),
    services: [...byGroup.get(id)!].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    ),
  }));
}

/** Toggle one id in the blocked list, preserving the order of the rest. */
export function toggleBlockedService(
  ids: readonly string[] | undefined,
  id: string,
  blocked: boolean,
): string[] {
  const current = Array.isArray(ids) ? ids : [];
  const has = current.includes(id);
  if (blocked && !has) return [...current, id];
  if (!blocked && has) return current.filter((x) => x !== id);
  return [...current];
}

/**
 * Base64 → SVG text, or null when it does not decode to an `<svg`. Done
 * once per icon and memoised by the caller; `atob` is a global on Hermes
 * (React Native ≥ 0.74) and in Node, so no polyfill.
 */
export function decodeServiceIcon(iconB64: string | undefined): string | null {
  if (!iconB64) return null;
  try {
    const bytes = atob(iconB64);
    // Icons are ASCII SVG; a UTF-8 decode is only needed for the odd
    // non-ASCII glyph, which `decodeURIComponent(escape(...))` handles
    // without pulling in TextDecoder.
    let text: string;
    try {
      text = decodeURIComponent(escape(bytes));
    } catch {
      text = bytes;
    }
    return text.includes("<svg") ? text : null;
  } catch {
    return null;
  }
}

const DAY_KEYS: (keyof Pick<AdguardSchedule, "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat">)[] = [
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
];
const DAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function formatMsClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 60_000));
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  // 24:00 is how AGH's web UI shows a range that runs to midnight.
  if (ms >= 24 * 3_600_000) return "24:00";
  return `${hh}:${mm}`;
}

function isActiveRange(r: AdguardDayRange | undefined): r is AdguardDayRange {
  return !!r && Number.isFinite(r.start) && Number.isFinite(r.end) && r.end > r.start;
}

/**
 * One line describing when blocking is PAUSED, e.g. "Paused Mon–Fri
 * 15:00–17:00, Sat 10:00–12:00", or null when the schedule has no windows
 * (= blocked all the time). Consecutive days with the same window
 * collapse into a range. The schedule itself is edited in AGH's web UI;
 * the app only shows it so a toggle that "does nothing" right now is
 * explained.
 */
export function describePauseSchedule(schedule: AdguardSchedule | undefined): string | null {
  if (!schedule) return null;
  const entries = DAY_KEYS.map((day) => {
    const r = schedule[day];
    return isActiveRange(r) ? { day, window: `${formatMsClock(r.start)}–${formatMsClock(r.end)}` } : null;
  });
  const parts: string[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (!e) {
      i += 1;
      continue;
    }
    let j = i;
    while (j + 1 < entries.length && entries[j + 1]?.window === e.window) j += 1;
    const label =
      j === i
        ? DAY_LABELS[e.day]!
        : j === i + 1
          ? `${DAY_LABELS[e.day]}, ${DAY_LABELS[entries[j]!.day]}`
          : `${DAY_LABELS[e.day]}–${DAY_LABELS[entries[j]!.day]}`;
    parts.push(`${label} ${e.window}`);
    i = j + 1;
  }
  if (parts.length === 0) return null;
  const tz = schedule.time_zone && schedule.time_zone !== "Local" ? ` (${schedule.time_zone})` : "";
  return `Paused ${parts.join(", ")}${tz}`;
}

/** Case-insensitive name/id match for the screen's search box. */
export function blockedServiceMatches(svc: AdguardBlockedServiceDef, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return svc.name.toLowerCase().includes(q) || svc.id.toLowerCase().includes(q);
}
