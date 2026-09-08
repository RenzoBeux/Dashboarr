/**
 * Minimal JSONPath-ish resolver for the `custom` service kind (see
 * lib/custom-service.ts): every health/stat/version value the user configures
 * is described as a dotted path into an arbitrary JSON response, resolved at
 * request time by `getPath`. Deliberately dependency-free — no gjson, no
 * lodash `get` — so it can be unit tested in isolation and bundled with zero
 * extra weight.
 *
 * Supported syntax:
 *   - dotted keys:        "data.status"
 *   - numeric indexes:    "items.0.name"  or  "items[0].name"
 *   - array length:       "items.#"  or  "items.length"  (must be the LAST
 *                          segment — earlier occurrences are treated as a
 *                          literal object key named "#"/"length")
 *   - map over an array:  "items.#.name"  or  "items[*].name" — applies the
 *                          remaining path to every element and returns an
 *                          array of results. A trailing "[*]"/"#" with
 *                          nothing after it returns the array itself.
 *
 * Missing/mistyped path segments resolve to `undefined` rather than
 * throwing — a user-authored path against a real server's JSON is exactly
 * the kind of input that will sometimes be wrong.
 */

type Step =
  | { kind: "key"; name: string }
  | { kind: "index"; index: number }
  | { kind: "length" }
  | { kind: "wildcard" };

/**
 * Tokenize a path into raw string segments, splitting on `.` outside of
 * `[...]` brackets and pulling bracket contents out as their own segment
 * (prefixed with `[` so the parse step below can tell "[0]" / "[*]" apart
 * from a bare key or index).
 */
function tokenize(path: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = path.length;
  while (i < n) {
    if (path[i] === ".") {
      i++;
      continue;
    }
    if (path[i] === "[") {
      const end = path.indexOf("]", i);
      const content = end === -1 ? path.slice(i + 1) : path.slice(i + 1, end);
      i = end === -1 ? n : end + 1;
      tokens.push(`[${content}`);
      continue;
    }
    let j = i;
    while (j < n && path[j] !== "." && path[j] !== "[") j++;
    const raw = path.slice(i, j);
    i = j;
    if (raw.length > 0) tokens.push(raw);
  }
  return tokens;
}

const INDEX_RE = /^-?\d+$/;

function parsePath(path: string): Step[] {
  const rawTokens = tokenize(path);
  return rawTokens.map((raw, idx): Step => {
    const isLast = idx === rawTokens.length - 1;

    if (raw.startsWith("[")) {
      const content = raw.slice(1);
      if (content === "*") return { kind: "wildcard" };
      if (INDEX_RE.test(content)) return { kind: "index", index: Number(content) };
      // Tolerate bracketed string keys, e.g. `["odd key"]` / `[odd-key]`.
      return { kind: "key", name: content.replace(/^["']|["']$/g, "") };
    }
    if (raw === "#") return isLast ? { kind: "length" } : { kind: "wildcard" };
    if (raw === "length" && isLast) return { kind: "length" };
    if (INDEX_RE.test(raw)) return { kind: "index", index: Number(raw) };
    return { kind: "key", name: raw };
  });
}

function evalFrom(value: unknown, steps: Step[], idx: number): unknown {
  if (idx >= steps.length) return value;
  const step = steps[idx];

  if (step.kind === "length") {
    if (Array.isArray(value)) return value.length;
    if (typeof value === "string") return value.length;
    return undefined;
  }

  if (step.kind === "wildcard") {
    if (!Array.isArray(value)) return undefined;
    const rest = steps.slice(idx + 1);
    if (rest.length === 0) return value.slice();
    return value.map((item) => evalFrom(item, rest, 0));
  }

  if (value === null || value === undefined) return undefined;

  if (step.kind === "index") {
    if (!Array.isArray(value)) return undefined;
    const i = step.index < 0 ? value.length + step.index : step.index;
    return evalFrom(value[i], steps, idx + 1);
  }

  // step.kind === "key"
  if (typeof value !== "object") return undefined;
  const v = (value as Record<string, unknown>)[step.name];
  return evalFrom(v, steps, idx + 1);
}

/** Resolve `path` against `obj`. An empty path returns `obj` unchanged. */
export function getPath(obj: unknown, path: string): unknown {
  if (path.trim() === "") return obj;
  const steps = parsePath(path);
  return evalFrom(obj, steps, 0);
}

export type StatFormat = "number" | "bytes" | "duration" | "percent" | "text";

const IEC_UNITS = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];

function toFiniteNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Best-effort plain-text rendering of any JSON value, used as the fallback
 * for every format when the value can't be interpreted numerically (a .NET
 * TimeSpan string in a "duration" stat, say) — formatStat must never throw. */
function rawToString(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  try {
    return JSON.stringify(raw);
  } catch {
    return String(raw);
  }
}

function formatBytesIec(n: number): string {
  if (n === 0) return "0 B";
  const negative = n < 0;
  const abs = Math.abs(n);
  const exp = Math.min(
    Math.floor(Math.log(abs) / Math.log(1024)),
    IEC_UNITS.length - 1,
  );
  const value = abs / Math.pow(1024, exp);
  return `${negative ? "-" : ""}${value.toFixed(1)} ${IEC_UNITS[exp]}`;
}

function formatDurationCompact(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  if (s < 60) return `${s}s`;
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  const units: Array<[number, string]> = [
    [days, "d"],
    [hours, "h"],
    [minutes, "m"],
    [secs, "s"],
  ];
  const start = units.findIndex(([v]) => v > 0);
  // s >= 60 guarantees minutes (index 2) is nonzero at worst.
  let parts = units.slice(start === -1 ? 2 : start);
  // Never show seconds once we're at minute resolution or coarser.
  parts = parts.filter(([, label]) => label !== "s");
  parts = parts.slice(0, 3);
  return parts.map(([v, label]) => `${v}${label}`).join(" ");
}

function trimTrailingZero(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function formatPercentValue(n: number): string {
  return `${trimTrailingZero(Math.round(n * 10) / 10)}%`;
}

function formatNumberValue(n: number): string {
  const isInt = Number.isInteger(n);
  const fixed = isInt ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const [sign, unsigned] = fixed.startsWith("-") ? ["-", fixed.slice(1)] : ["", fixed];
  const [intPart, decPart] = unsigned.split(".");
  const withCommas = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${withCommas}${decPart ? `.${decPart}` : ""}`;
}

/**
 * Render a raw JSONPath-extracted value for display, per a stat's configured
 * `format`. Never throws: a value that doesn't parse as a number under
 * number/bytes/duration/percent falls back to its raw string form (e.g.
 * Cleanuparr's `upTime` is a .NET TimeSpan string like "0.12:34:56.789", not
 * a second count) rather than blowing up the widget that renders it.
 */
export function formatStat(raw: unknown, format?: StatFormat): string {
  if (raw === undefined || raw === null) return "";

  if (format === "text" || format === undefined) return rawToString(raw);

  const n = toFiniteNumber(raw);
  if (n === null) return rawToString(raw);

  switch (format) {
    case "bytes":
      return formatBytesIec(n);
    case "duration":
      return formatDurationCompact(n);
    case "percent":
      return formatPercentValue(n);
    case "number":
      return formatNumberValue(n);
    default:
      return rawToString(raw);
  }
}
