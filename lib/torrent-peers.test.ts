import { swarmOrConnected } from "./torrent-peers";

describe("swarmOrConnected", () => {
  it("prefers the swarm total", () => {
    expect(swarmOrConnected(90, 0)).toBe(90);
    expect(swarmOrConnected(0, 4)).toBe(0);
  });

  // qBittorrent sends -1 when no tracker has reported a scrape, and its own
  // web UI drops the swarm figure rather than printing it.
  it("falls back to the connected count when the swarm total is unknown", () => {
    expect(swarmOrConnected(-1, 4)).toBe(4);
    expect(swarmOrConnected(undefined, 4)).toBe(4);
  });
});
