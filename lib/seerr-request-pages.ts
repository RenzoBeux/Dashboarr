import type { OverseerrRequest, OverseerrRequestsResponse } from "@/lib/types";

/** Page size for the Requests screen's GET /request pages (#518). */
export const SEERR_REQUESTS_PAGE_SIZE = 20;

/**
 * The next 1-based page of GET /request, or undefined once everything is
 * loaded. `pageInfo.results` is the server-side total for the current filter
 * (`requestCount` in Seerr's server/routes/request.ts), so fewer loaded rows
 * than that means there is more. An empty page also stops, so a total that
 * drifts while paging can never loop.
 */
export function nextSeerrRequestsPage(
  lastPage: OverseerrRequestsResponse,
  allPages: OverseerrRequestsResponse[],
): number | undefined {
  if (lastPage.results.length === 0) return undefined;
  const loaded = allPages.reduce((n, page) => n + page.results.length, 0);
  return loaded < lastPage.pageInfo.results ? allPages.length + 1 : undefined;
}

/**
 * Flattens the loaded pages into one list. Paging is skip-based, so a request
 * created between two page fetches shifts every offset by one and the last
 * row of a page comes back again at the top of the next; keep the first copy.
 */
export function flattenSeerrRequestPages(
  pages: OverseerrRequestsResponse[] | undefined,
): OverseerrRequest[] {
  if (!pages) return [];
  const seen = new Set<number>();
  const out: OverseerrRequest[] = [];
  for (const page of pages) {
    for (const request of page.results) {
      if (seen.has(request.id)) continue;
      seen.add(request.id);
      out.push(request);
    }
  }
  return out;
}
