import type { ArrCustomFilter, ArrFilterClause, ArrRelease } from "@/lib/types";

// Faithful port of Sonarr/Radarr's CLIENT-SIDE custom-filter engine, so a saved
// "interactive search" filter applies in Dashboarr exactly as it does in the
// *arr web UI. Saved filters are stored server-side (GET /api/v3/customfilter)
// but *arr never filters releases on the server — the web app does it in the
// browser. We reproduce that here against our own release objects.
//
// Sources (Sonarr & Radarr `frontend/src`, identical semantics):
//   - Helpers/Props/filterTypePredicates.js  (the generic operators below)
//   - Helpers/Props/filterTypes.js           (the operator string values)
//   - Store/Actions/releaseActions.js        (the per-key release predicates)
//   - Store/Selectors/createClientSideCollectionSelector.js (the clause loop)

// Operator string values as stored in a clause's `type`.
type Operator =
  | "contains"
  | "equal"
  | "greaterThan"
  | "greaterThanOrEqual"
  | "lessThan"
  | "lessThanOrEqual"
  | "notContains"
  | "notEqual"
  | "startsWith"
  | "notStartsWith"
  | "endsWith"
  | "notEndsWith";

function lower(v: unknown): string {
  return String(v ?? "").toLowerCase();
}

// Port of filterTypePredicates. `contains`/`notContains` treat an array
// itemValue as set-membership (=== on each element, matching *arr which does NOT
// lowercase array elements); a scalar itemValue is a case-insensitive substring
// test. Numeric operators coerce both sides with Number() — *arr coerces
// numerics server-side, and a clause `value` can serialize as a string in some
// *arr versions, so this keeps comparisons apples-to-apples.
const OPERATORS: Record<Operator, (itemValue: unknown, filterValue: unknown) => boolean> = {
  contains: (i, f) =>
    Array.isArray(i) ? i.some((v) => v === f) : lower(i).includes(lower(f)),
  notContains: (i, f) =>
    Array.isArray(i) ? !i.some((v) => v === f) : !lower(i).includes(lower(f)),
  equal: (i, f) => i === f,
  notEqual: (i, f) => i !== f,
  greaterThan: (i, f) => Number(i) > Number(f),
  greaterThanOrEqual: (i, f) => Number(i) >= Number(f),
  lessThan: (i, f) => Number(i) < Number(f),
  lessThanOrEqual: (i, f) => Number(i) <= Number(f),
  startsWith: (i, f) => lower(i).startsWith(lower(f)),
  notStartsWith: (i, f) => !lower(i).startsWith(lower(f)),
  endsWith: (i, f) => lower(i).endsWith(lower(f)),
  notEndsWith: (i, f) => !lower(i).endsWith(lower(f)),
};

function isOperator(type: string): type is Operator {
  return type in OPERATORS;
}

// Coerce common boolean serializations (true/false, "true"/"false", 1/0) used by
// the EXACT bool columns: fullSeason, episodeRequested, movieRequested.
function toBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

// Per-key predicates that *arr special-cases for the "releases" section. These
// take precedence over the generic operator path. Each returns whether a single
// `release` matches a single (already-unwrapped) `value` under `op`.
const KEY_PREDICATES: Record<
  string,
  (release: ArrRelease, value: unknown, op: Operator) => boolean
> = {
  // quality compares by quality id and only supports equal / notEqual. Number()
  // both sides so a value serialized as "7" still matches id 7.
  quality: (release, value, op) => {
    const id = release.quality?.quality?.id;
    if (op === "equal") return Number(id) === Number(value);
    if (op === "notEqual") return Number(id) !== Number(value);
    return false;
  },
  // languages filters on language NAMES (the *arr options selector uses
  // language.name as the option id), via the generic operator over the array.
  languages: (release, value, op) =>
    OPERATORS[op]((release.languages ?? []).map((l) => l.name), value),
  // peers = seeders + leechers (each defaulting to 0, so usenet releases compare
  // as 0 rather than being dropped).
  peers: (release, value, op) =>
    OPERATORS[op]((release.seeders ?? 0) + (release.leechers ?? 0), value),
  rejectionCount: (release, value, op) =>
    OPERATORS[op]((release.rejections ?? []).length, value),
};

// Known optional numeric columns that *arr materializes as 0. JSON from the
// `/release` API omits these for usenet releases, so we default them to 0
// instead of treating the key as "missing" (which would over-filter usenet
// results versus what the *arr UI shows).
const NUMERIC_DEFAULT_ZERO = new Set([
  "seeders",
  "leechers",
  "customFormatScore",
]);
const BOOL_KEYS = new Set(["fullSeason", "episodeRequested", "movieRequested"]);

// Evaluate one clause against one release for a single scalar value.
function matchOne(release: ArrRelease, key: string, value: unknown, op: Operator): boolean {
  const keyPredicate = KEY_PREDICATES[key];
  if (keyPredicate) return keyPredicate(release, value, op);

  const record = release as unknown as Record<string, unknown>;

  if (BOOL_KEYS.has(key)) {
    const itemValue = record[key];
    if (op === "equal") return toBool(itemValue) === toBool(value);
    if (op === "notEqual") return toBool(itemValue) !== toBool(value);
    return false;
  }

  const has = Object.prototype.hasOwnProperty.call(release, key);
  if (!has && !NUMERIC_DEFAULT_ZERO.has(key)) {
    // Genuinely unknown / absent column → reject, matching *arr's fallthrough.
    return false;
  }
  const itemValue = has ? record[key] : 0; // NUMERIC_DEFAULT_ZERO and missing
  return OPERATORS[op](itemValue, value);
}

// Evaluate one clause (which may carry an array `value`) against one release.
function matchClause(release: ArrRelease, clause: ArrFilterClause): boolean {
  const op = clause.type ?? "equal";
  if (!isOperator(op)) return false;

  const { key, value } = clause;
  try {
    if (Array.isArray(value)) {
      // Array values OR together (.some), except negation operators which AND
      // (.every) — exactly as *arr's selector does.
      if (op === "notContains" || op === "notEqual") {
        return value.every((v) => matchOne(release, key, v, op));
      }
      return value.some((v) => matchOne(release, key, v, op));
    }
    return matchOne(release, key, value, op);
  } catch {
    // One malformed clause must never blank the whole list.
    return false;
  }
}

/**
 * Apply a saved *arr custom filter to a list of releases, reproducing the *arr
 * web UI's behaviour. Clauses combine with AND; an empty `filters` array passes
 * everything through. Pure — safe to call inside a useMemo.
 */
export function applyArrCustomFilter<T extends ArrRelease>(
  releases: T[],
  filter: ArrCustomFilter,
): T[] {
  const clauses = filter.filters ?? [];
  if (clauses.length === 0) return releases;
  return releases.filter((release) =>
    clauses.every((clause) => matchClause(release, clause)),
  );
}
