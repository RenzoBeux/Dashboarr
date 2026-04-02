import { useQuery } from "@tanstack/react-query";
import { pingService } from "@/lib/http-client";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_IDS, POLLING_INTERVALS } from "@/lib/constants";
import type { ServiceHealthStatus } from "@/lib/types";

export function useServiceHealth() {
  const services = useConfigStore((s) => s.services);

  return useQuery({
    queryKey: ["serviceHealth"],
    queryFn: async (): Promise<ServiceHealthStatus[]> => {
      const results = await Promise.all(
        SERVICE_IDS.map(async (id) => {
          const config = services[id];
          if (!config.enabled) {
            return { id, name: config.name, online: false };
          }
          const responseTime = await pingService(id);
          return {
            id,
            name: config.name,
            online: responseTime !== null,
            responseTime: responseTime ?? undefined,
          };
        }),
      );
      return results;
    },
    refetchInterval: POLLING_INTERVALS.serviceHealth,
  });
}
