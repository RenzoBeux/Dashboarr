import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCpu, getPerCpu, getLoad, getMem, getFs, getDiskIO, getNet, getGpu, getContainers, diskIoRateMap } from "@/services/glances-api";
import type { DiskIoRate } from "@/services/glances-api";
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

const EMPTY_DISK_IO_RATES: ReadonlyMap<string, DiskIoRate> = new Map();

// Device-keyed I/O rates for callers that look up a single disk (the unRAID
// screen) instead of rendering the whole list. Shares useGlancesDiskIO's query
// key and poll, so it costs nothing extra and stays inert when Glances isn't
// configured.
//
// An errored query keeps returning its last successful data for gcTime (5min),
// which off the Glances screen would mean frozen numbers with nothing on screen
// to hint they're stale — so an error resolves to no rates at all.
export function useGlancesDiskIoRates(instanceId?: string): ReadonlyMap<string, DiskIoRate> {
  const { data, isError } = useGlancesDiskIO(instanceId);
  return useMemo(
    () => (isError || !data ? EMPTY_DISK_IO_RATES : diskIoRateMap(data)),
    [data, isError],
  );
}

export function useGlancesNet(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "net"],
    queryFn: () => getNet(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesGpu(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "gpu"],
    queryFn: () => getGpu(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}

export function useGlancesContainers(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("glances", instanceId);
  return useQuery({
    queryKey: ["glances", id, "containers"],
    queryFn: () => getContainers(id ?? undefined),
    refetchInterval: FAST_POLL,
    enabled: enabled && !!id,
  });
}
