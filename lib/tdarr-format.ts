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
