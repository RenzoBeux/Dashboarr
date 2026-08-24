import { HttpError, serviceRequest } from "@/lib/http-client";

// Sonarr/Radarr/Prowlarr/Lidarr all expose `GET <apiBasePath>/health`, the
// array of issues surfaced on each app's System > Health page (down indexers,
// pending updates, failed lists, …). The relative path is identical across the
// four — it resolves under each service's apiBasePath — so one shared fetch
// covers all of them rather than four copies (issue #210).

export type ArrHealthType = "ok" | "notice" | "warning" | "error";

export interface ArrHealthIssue {
  source: string;
  type: ArrHealthType;
  message: string;
  wikiUrl?: string;
}

// The *arr kinds that expose a /health endpoint.
export type ArrHealthServiceId = "radarr" | "sonarr" | "prowlarr" | "lidarr";

export const ARR_HEALTH_SERVICE_IDS: readonly ArrHealthServiceId[] = [
  "radarr",
  "sonarr",
  "prowlarr",
  "lidarr",
] as const;

export function getArrHealth(
  serviceId: ArrHealthServiceId,
  instanceId?: string,
): Promise<ArrHealthIssue[]> {
  return serviceRequest<ArrHealthIssue[]>(serviceId, "/health", { instanceId });
}

// Upstream parity (issue #268): the *arr Health pages render a test-tube
// "Test All" button only for these health sources. Radarr/Sonarr (/api/v3) and
// Prowlarr/Lidarr (/api/v1) all expose indexer/testall and
// downloadclient/testall; applications/testall (note the plural) is
// Prowlarr-only. `kinds` narrows a source to the apps whose Health page
// actually offers the button — Prowlarr's has no Test All on DownloadClientCheck
// even though the route exists (see each app's frontend/src/System/Status/
// Health/Health.tsx).
const NOT_PROWLARR = ["radarr", "sonarr", "lidarr"] as const;
const PROWLARR_ONLY = ["prowlarr"] as const;

interface TestAllTarget {
  path: string;
  // Provider noun for the result copy ("2 of 8 indexers failed").
  noun: string;
  nouns: string;
  kinds?: readonly ArrHealthServiceId[];
}

const TEST_ALL_BY_SOURCE: Record<string, TestAllTarget> = {
  IndexerStatusCheck: {
    path: "/indexer/testall",
    noun: "indexer",
    nouns: "indexers",
  },
  IndexerLongTermStatusCheck: {
    path: "/indexer/testall",
    noun: "indexer",
    nouns: "indexers",
  },
  DownloadClientStatusCheck: {
    path: "/downloadclient/testall",
    noun: "download client",
    nouns: "download clients",
  },
  DownloadClientCheck: {
    path: "/downloadclient/testall",
    noun: "download client",
    nouns: "download clients",
    kinds: NOT_PROWLARR,
  },
  ApplicationStatusCheck: {
    path: "/applications/testall",
    noun: "application",
    nouns: "applications",
    kinds: PROWLARR_ONLY,
  },
  ApplicationLongTermStatusCheck: {
    path: "/applications/testall",
    noun: "application",
    nouns: "applications",
    kinds: PROWLARR_ONLY,
  },
};

function testAllTarget(
  serviceId: ArrHealthServiceId,
  source: string,
): TestAllTarget | null {
  const entry = TEST_ALL_BY_SOURCE[source];
  if (!entry) return null;
  if (entry.kinds && !entry.kinds.includes(serviceId)) return null;
  return entry;
}

// null → this source has no test action; render nothing, matching upstream.
export function testAllTargetForHealthSource(
  serviceId: ArrHealthServiceId,
  source: string,
): Readonly<TestAllTarget> | null {
  return testAllTarget(serviceId, source);
}

// testall runs synchronously server-side — the response doesn't arrive until
// every provider has been probed, and an instance with dozens of indexers can
// take well over a minute. The 15s serviceRequest default would abort mid-run
// and misreport failure while the server keeps testing.
const TEST_ALL_TIMEOUT_MS = 120_000;

// One entry per tested provider, as returned by Servarr's
// ProviderControllerBase.TestAll (`ProviderTestAllResult`). Every field is
// optional here because the shape is only guaranteed by the server we happen
// to be talking to.
export interface ProviderTestAllResult {
  id?: number;
  isValid?: boolean;
  validationFailures?: { propertyName?: string; errorMessage?: string }[];
}

export interface TestAllProvider {
  id: number;
  // Provider name when the id could be resolved, else "#<id>".
  name: string;
  ok: boolean;
  // The server's reason(s) for a failure, joined; empty string when ok.
  message: string;
}

export interface TestAllOutcome {
  noun: string;
  nouns: string;
  // Every provider the server tested (enabled + settings-valid ones only), in
  // the order it reported them. Passing ones are kept: the results view shows
  // the whole run, not just what broke.
  providers: TestAllProvider[];
  failed: number;
}

function isFailedResult(r: ProviderTestAllResult): boolean {
  // `isValid` is a computed, serialized property upstream; fall back to the
  // failure list for builds/forks that omit it.
  if (typeof r.isValid === "boolean") return !r.isValid;
  return (r.validationFailures?.length ?? 0) > 0;
}

// The body of a testall response (200 or 400) when it's the documented result
// list. Returns null for anything else, so a genuine bad request still reads
// as an error rather than an empty "all passed".
export function parseTestAllResults(
  body: unknown,
): ProviderTestAllResult[] | null {
  if (!Array.isArray(body)) return null;
  if (body.some((e) => typeof e !== "object" || e === null)) return null;
  return body as ProviderTestAllResult[];
}

export function summarizeTestAll(
  results: ProviderTestAllResult[],
  target: Pick<TestAllTarget, "noun" | "nouns">,
  names: Map<number, string>,
): TestAllOutcome {
  const providers = results.map((r) => {
    const id = typeof r.id === "number" ? r.id : -1;
    const ok = !isFailedResult(r);
    const message = (r.validationFailures ?? [])
      .map((f) => f?.errorMessage?.trim())
      .filter((m): m is string => !!m)
      .join("; ");
    return {
      id,
      name: names.get(id) ?? (id >= 0 ? `#${id}` : "Unknown"),
      ok,
      message: ok ? "" : message || "Test failed",
    };
  });
  return {
    noun: target.noun,
    nouns: target.nouns,
    providers,
    failed: providers.filter((p) => !p.ok).length,
  };
}

// Provider list for the same route, used to turn the ids in a testall result
// into names. Best-effort: a failure here just leaves "#<id>" in the report, so
// it must never sink the test result itself.
async function fetchProviderNames(
  serviceId: ArrHealthServiceId,
  testAllPath: string,
  instanceId?: string,
): Promise<Map<number, string>> {
  const names = new Map<number, string>();
  try {
    const list = await serviceRequest<{ id?: number; name?: string }[]>(
      serviceId,
      testAllPath.replace(/\/testall$/, ""),
      { instanceId },
    );
    for (const p of Array.isArray(list) ? list : []) {
      if (typeof p?.id === "number" && typeof p?.name === "string" && p.name) {
        names.set(p.id, p.name);
      }
    }
  } catch {
    // Ignore — names are a nicety, the failures list is the payload.
  }
  return names;
}

// Runs the source's "Test All" and reports what happened per provider.
//
// Servarr's ProviderControllerBase.TestAll answers `400 Bad Request` WITH the
// full result list whenever any provider fails its test
// (`return result.Any(c => !c.IsValid) ? BadRequest(result) : Ok(result);`).
// That is the *normal* response to pressing Test All on a failing health item,
// so a 400 carrying the result array is parsed as an outcome rather than
// thrown. Everything else — 401, 404, unreachable, a 400 with some other body —
// still throws and reaches the caller's error path.
export async function testAllForHealthSource(
  serviceId: ArrHealthServiceId,
  source: string,
  instanceId?: string,
): Promise<TestAllOutcome> {
  const target = testAllTarget(serviceId, source);
  if (!target) {
    throw new Error(`No test action for health source ${source}`);
  }

  let results: ProviderTestAllResult[];
  try {
    const body = await serviceRequest<unknown>(serviceId, target.path, {
      method: "POST",
      // Empty body: serviceRequest only infers Content-Type when a body exists.
      headers: { "Content-Type": "application/json" },
      instanceId,
      timeout: TEST_ALL_TIMEOUT_MS,
    });
    // Older builds answer with an empty body; treat that as "ran, nothing to
    // report" rather than an unparseable response.
    results = parseTestAllResults(body) ?? [];
  } catch (err) {
    const parsed =
      err instanceof HttpError && err.status === 400
        ? parseTestAllResults(err.body)
        : null;
    if (!parsed) throw err;
    results = parsed;
  }

  // The results view lists every provider it tested, passing ones included, so
  // names are needed whenever the server reported anything at all.
  const names = results.length
    ? await fetchProviderNames(serviceId, target.path, instanceId)
    : new Map<number, string>();
  return summarizeTestAll(results, target, names);
}

// One-line verdict for the results view's header. The per-provider detail lives
// in the list below it, so this stays a count and never has to elide anything.
export function describeTestAllOutcome(outcome: TestAllOutcome): {
  ok: boolean;
  headline: string;
} {
  const { providers, failed, noun, nouns } = outcome;
  const total = providers.length;
  if (total === 0) {
    // Upstream only tests enabled providers whose settings validate, so an
    // empty run is a real answer: there was nothing eligible to test.
    return { ok: true, headline: `No enabled ${nouns} to test` };
  }
  if (failed === 0) {
    return { ok: true, headline: `All ${total} ${total === 1 ? noun : nouns} passed` };
  }
  return { ok: false, headline: `${failed} of ${total} ${nouns} failed` };
}

// Clipboard payload for the results view: the whole run, one provider per line,
// so a user can paste it into a forum post or issue without retyping it.
export function formatTestAllReport(outcome: TestAllOutcome): string {
  const { headline } = describeTestAllOutcome(outcome);
  return [
    headline,
    ...outcome.providers.map((p) =>
      p.ok ? `OK   ${p.name}` : `FAIL ${p.name}: ${p.message}`,
    ),
  ].join("\n");
}

// Worst severity across a set of issues, used to colour the alert badge.
// "notice" is folded into "warning" (amber); only "error" escalates to red.
// Returns null when there's nothing to flag.
export type ArrHealthSeverity = "warning" | "error";

export function worstSeverity(
  issues: ArrHealthIssue[],
): ArrHealthSeverity | null {
  let severity: ArrHealthSeverity | null = null;
  for (const issue of issues) {
    if (issue.type === "error") return "error";
    if (issue.type === "warning" || issue.type === "notice")
      severity = "warning";
  }
  return severity;
}

// Per-issue accent colour in the details sheet (notice shares warning's amber).
export const HEALTH_TYPE_COLOR: Record<ArrHealthType, string> = {
  ok: "#22c55e",
  notice: "#f59e0b",
  warning: "#f59e0b",
  error: "#ef4444",
};
