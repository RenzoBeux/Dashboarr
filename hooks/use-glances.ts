import { useQuery } from "@tanstack/react-query";
import { getCpu, getPerCpu, getLoad, getMem, getFs, getDiskIO } from "@/services/glances-api";
import { useConfigStore } from "@/store/config-store";

const FAST_POLL = 5000;
const SLOW_POLL = 30000;

function useGlancesEnabled() {
  return useConfigStore((s) => s.services.glances.enabled);
}

export function useGlancesCpu() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "cpu"],
    queryFn: getCpu,
    refetchInterval: FAST_POLL,
    enabled,
  });
}

export function useGlancesPerCpu() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "percpu"],
    queryFn: getPerCpu,
    refetchInterval: FAST_POLL,
    enabled,
  });
}

export function useGlancesLoad() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "load"],
    queryFn: getLoad,
    refetchInterval: FAST_POLL,
    enabled,
  });
}

export function useGlancesMem() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "mem"],
    queryFn: getMem,
    refetchInterval: FAST_POLL,
    enabled,
  });
}

export function useGlancesFs() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "fs"],
    queryFn: getFs,
    refetchInterval: SLOW_POLL,
    enabled,
  });
}

export function useGlancesDiskIO() {
  const enabled = useGlancesEnabled();
  return useQuery({
    queryKey: ["glances", "diskio"],
    queryFn: getDiskIO,
    refetchInterval: FAST_POLL,
    enabled,
  });
}
