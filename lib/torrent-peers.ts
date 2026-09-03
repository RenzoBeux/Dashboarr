/**
 * qBittorrent reports peers as two pairs: connected (`num_seeds` /
 * `num_leechs`) and the swarm totals the tracker scraped (`num_complete` /
 * `num_incomplete`), and it uses -1 for a swarm total no tracker has reported.
 *
 * Prefer the swarm total: on a mostly-seeding library the connected count sits
 * at 0 for nearly every torrent, so a tile built from it reads as broken.
 */
export function swarmOrConnected(
  swarm: number | undefined,
  connected: number,
): number {
  return swarm !== undefined && swarm >= 0 ? swarm : connected;
}
