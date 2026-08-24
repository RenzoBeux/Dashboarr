import { describeGrabFailure } from "./download-client-error";

// The literals below are copied verbatim from the *arr sources so a future
// upstream reword shows up as a failing expectation rather than a silently
// dead rewrite:
//   src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxyV2.cs
//   src/NzbDrone.Core/Download/Clients/Deluge/DelugeProxy.cs

describe("describeGrabFailure", () => {
  it("rewrites the qBittorrent 'check your settings' message (#329)", () => {
    const out = describeGrabFailure(
      "Failed to connect to qBittorrent, check your settings.",
      "Radarr",
    );
    expect(out).toBe(
      "qBittorrent did not accept the release. It is most likely already added; if it isn't, check that Radarr can reach qBittorrent.",
    );
  });

  it("handles the 'please check your settings' variant", () => {
    expect(
      describeGrabFailure(
        "Failed to connect to qBittorrent, please check your settings.",
        "Sonarr",
      ),
    ).toContain("qBittorrent did not accept the release.");
  });

  it("keeps whichever download client the *arr named", () => {
    expect(
      describeGrabFailure(
        "Failed to connect to Deluge, check your settings.",
        "Prowlarr",
      ),
    ).toBe(
      "Deluge did not accept the release. It is most likely already added; if it isn't, check that Prowlarr can reach Deluge.",
    );
  });

  it("rewrites the older 'Fails.' body mapping", () => {
    expect(
      describeGrabFailure("Download client failed to add torrent by url", "Radarr"),
    ).toBe(
      "Radarr's download client did not accept the release. It is most likely already added.",
    );
    expect(
      describeGrabFailure("Download client failed to add torrent", "Sonarr"),
    ).toBe(
      "Sonarr's download client did not accept the release. It is most likely already added.",
    );
  });

  it("tolerates surrounding whitespace", () => {
    expect(
      describeGrabFailure(
        "  Failed to connect to qBittorrent, check your settings.  ",
        "Radarr",
      ),
    ).toBeDefined();
  });

  it("leaves every other server message alone", () => {
    for (const msg of [
      "Failed to authenticate with qBittorrent.",
      "Unable to connect to qBittorrent, certificate validation failed.",
      "Couldn't find requested release in cache, try searching again",
      "Indexer is not configured",
      "",
    ]) {
      expect(describeGrabFailure(msg, "Radarr")).toBeUndefined();
    }
  });
});
