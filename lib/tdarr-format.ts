// Tdarr's REST API returns several numeric fields (tdarrScore, cpuPerc, …) as
// strings, and some fields are missing/undefined on malformed or in-flight
// data. Centralized here so the tab and the dashboard widget render the same
// "—" fallback instead of "NaN%" or the literal string "undefined".
export function fmt(n: number | string | null | undefined, dp = 1): string {
  const num = typeof n === "string" ? Number(n) : n;
  return typeof num === "number" && Number.isFinite(num) ? num.toFixed(dp) : "—";
}

// Tdarr node processes can run on Windows, where `file` paths come back
// backslash-separated — a plain `.split("/")` leaves the whole path as the
// "basename" on those servers.
export function fileBaseName(path: string | undefined | null): string | undefined {
  if (!path) return undefined;
  const segments = path.split(/[\\/]/);
  return segments[segments.length - 1] || undefined;
}

// Sums a Tdarr count that arrives split across CPU/GPU keys. These types were
// mapped from a live instance, so a key can simply be absent on another build,
// and a plain `a + b` then renders the literal "NaN". Missing parts count as
// zero; the pill falls back to "—" only when nothing at all was reported.
export function sumParts(...parts: (number | string | null | undefined)[]): string {
  const nums = parts
    .map((part) => (typeof part === "string" ? Number(part) : part))
    .filter((n): n is number => typeof n === "number" && Number.isFinite(n));
  return nums.length > 0 ? String(nums.reduce((sum, n) => sum + n, 0)) : "—";
}
