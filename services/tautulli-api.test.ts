jest.mock("@/store/config-store", () => ({
  useConfigStore: {
    getState: () => ({
      getActiveInstanceId: () => "t1",
      getActiveUrl: () => "https://tautulli.example.com/",
      instanceSecrets: { t1: { apiKey: "secret" } },
    }),
  },
}));

import { getTautulliSessionEpisodeStill, getTautulliSessionPoster } from "./tautulli-api";
import type { TautulliSession } from "@/lib/types";

function session(over: Partial<TautulliSession> = {}): TautulliSession {
  return {
    media_type: "episode",
    rating_key: "300",
    parent_rating_key: "200",
    grandparent_rating_key: "100",
    thumb: "/library/metadata/300/thumb/1",
    parent_thumb: "/library/metadata/200/thumb/1",
    grandparent_thumb: "/library/metadata/100/thumb/1",
    ...over,
  } as TautulliSession;
}

describe("Tautulli session artwork (#408)", () => {
  it("posters an episode with its show and keeps the episode's frame as the still", () => {
    expect(getTautulliSessionPoster(session(), 220, 330, "t1")?.uri).toContain(
      "img=/library/metadata/100/thumb/1",
    );
    const still = getTautulliSessionEpisodeStill(session(), 587, 330, "t1");
    expect(still?.uri).toContain("img=/library/metadata/300/thumb/1");
    expect(still?.uri).toContain("width=587&height=330");
    // The 16:9 placeholder, not a poster-shaped one, when Plex has no frame yet.
    expect(still?.uri).toContain("fallback=art");
    expect(still?.cacheKey).not.toContain("apikey");
  });

  it("derives the frame from the rating key when the session carries no thumb", () => {
    expect(getTautulliSessionEpisodeStill(session({ thumb: "" }), 587, 330, "t1")?.uri).toContain(
      "img=/library/metadata/300/thumb&",
    );
    expect(
      getTautulliSessionEpisodeStill(session({ thumb: "", rating_key: "" }), 587, 330, "t1"),
    ).toBeNull();
  });

  it("has no still for movies or tracks", () => {
    expect(getTautulliSessionEpisodeStill(session({ media_type: "movie" }))).toBeNull();
    expect(getTautulliSessionEpisodeStill(session({ media_type: "track" }))).toBeNull();
  });
});
