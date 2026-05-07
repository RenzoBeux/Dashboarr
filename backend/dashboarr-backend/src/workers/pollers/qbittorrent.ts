import { instanceToServiceConfig } from "../../db/repos/config.js";
import {
  countEnabledInstancesByKind,
  type StoredServiceInstance,
} from "../../db/repos/service-instance.js";
import { getQbTorrents } from "../../services/qbittorrent.js";
import { diffQbTorrents } from "../transitions.js";

export async function pollQbittorrent(instance: StoredServiceInstance): Promise<void> {
  const torrents = await getQbTorrents(instanceToServiceConfig(instance));
  const multiple = (countEnabledInstancesByKind().get("qbittorrent") ?? 0) > 1;
  await diffQbTorrents(instance.id, instance.name, multiple, torrents);
}
