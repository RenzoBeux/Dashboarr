import type { StoredServiceConfig } from "../../db/repos/config.js";
import { pingService } from "../../services/http.js";
import { diffHealth } from "../transitions.js";

export async function pollServiceHealth(configs: StoredServiceConfig[]): Promise<void> {
  await Promise.all(
    configs.map(async (config) => {
      const online = await pingService(config);
      await diffHealth(config.id, config.name, online);
    }),
  );
}
