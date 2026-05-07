import { useQuery } from "@tanstack/react-query";
import { getCpu, getPerCpu, getLoad, getMem, getFs, getDiskIO } from "@/services/glances-api";
import { useInstanceTarget } from "@/hooks/use-instance-target";

const FAST_POLL = 5000;
const SLOW_POLL = 30000;

export function useGlancesCpu(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "cpu"],
    queryFn: () => getCpu(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesPerCpu(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "percpu"],
    queryFn: () => getPerCpu(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesLoad(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "load"],
    queryFn: () => getLoad(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesMem(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "mem"],
    queryFn: () => getMem(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesFs(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "fs"],
    queryFn: () => getFs(id ?? undefined),
    refetchInterval: SLOW_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesDiskIO(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "diskio"],
    queryFn: () => getDiskIO(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}
