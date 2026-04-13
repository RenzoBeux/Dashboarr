import type { StoredServiceConfig } from "../../db/repos/config.js";
import { getQbTorrents } from "../../services/qbittorrent.js";
import { diffQbTorrents } from "../transitions.js";

export async function pollQbittorrent(config: StoredServiceConfig): Promise<void> {
  const torrents = await getQbTorrents(config);
  await diffQbTorrents(torrents);
}
