jest.mock("@/lib/http-client", () => ({ serviceRequest: jest.fn() }));

import { serviceRequest } from "@/lib/http-client";
import { getDemoResponse } from "@/lib/demo-data";
import { detectArrLinks } from "@/services/bazarr-api";

// Route the service module's requests through the demo fixtures.
beforeEach(() => {
  (serviceRequest as jest.Mock).mockImplementation((serviceId, path) =>
    Promise.resolve(getDemoResponse(serviceId, path)),
  );
});

/**
 * Demo mode is a first-class path — it is what store screenshots use and what
 * a user sees before configuring anything. These push the Bazarr fixtures
 * through the real service code, so a drifted fixture cannot make demo mode
 * look right while the live integration breaks.
 */

const demo = (path: string) => getDemoResponse("bazarr", path);

describe("routing", () => {
  it("answers every path the API module calls", () => {
    for (const path of [
      "/movies/wanted",
      "/episodes/wanted",
      "/movies/history",
      "/episodes/history",
      "/providers",
      "/system/status",
      "/system/settings",
    ]) {
      expect(demo(path)).toBeDefined();
    }
  });
});

describe("link detection", () => {
  it("finds nothing, so the demo links pinned in the config stay in charge", async () => {
    // Demo instances have no API keys; a keyless match must never happen.
    const result = await detectArrLinks({
      radarr: [{ id: "r1", localUrl: "http://radarr:7878", remoteUrl: "" }],
      sonarr: [{ id: "s1", apiKey: "", localUrl: "http://sonarr:8989", remoteUrl: "" }],
    });
    expect(result.radarr.instanceId).toBeNull();
    expect(result.sonarr.instanceId).toBeNull();
    expect(result.radarr.address).toBe("radarr:7878");
  });
});
