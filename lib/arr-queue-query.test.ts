// The adapters reach services -> http-client -> the config store, which pulls
// in AsyncStorage. Nothing here fetches; stub it so the module graph loads.
jest.mock("@/store/config-store", () => ({ useConfigStore: { getState: () => ({}) } }));

import { radarrQueueQuery, sonarrQueueQuery } from "@/lib/arr-queue-query";
import { radarrArrQueueAdapter } from "@/lib/arr-queue-adapters/radarr";
import { sonarrArrQueueAdapter } from "@/lib/arr-queue-adapters/sonarr";

// TanStack keeps one queryFn per cache key, so two producers of the same key
// with different request args make the effective page size depend on which
// screens happen to be mounted (#401). The args are structurally shared now;
// this pins the other half of the invariant, the key itself.
describe("shared *arr queue cache entry", () => {
  it("uses the same key as the queue adapters", () => {
    expect(sonarrQueueQuery("home").queryKey).toEqual(
      sonarrArrQueueAdapter.queueQueryKey("home"),
    );
    expect(radarrQueueQuery("home").queryKey).toEqual(
      radarrArrQueueAdapter.queueQueryKey("home"),
    );
  });

  it("scopes the key per instance", () => {
    expect(sonarrQueueQuery("home").queryKey).not.toEqual(
      sonarrQueueQuery("cabin").queryKey,
    );
  });
});
