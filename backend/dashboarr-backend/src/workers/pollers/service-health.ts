import { instanceToServiceConfig } from "../../db/repos/config.js";
import type { StoredServiceInstance } from "../../db/repos/service-instance.js";
import { pingService } from "../../services/http.js";
import { diffHealth } from "../transitions.js";

export async function pollServiceHealth(instances: StoredServiceInstance[]): Promise<void> {
  await Promise.all(
    instances.map(async (inst) => {
      const online = await pingService(instanceToServiceConfig(inst));
      await diffHealth(inst.id, inst.serviceId, inst.name, online);
    }),
  );
}
