import { useEffect, useState } from "react";
import { AppState } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { appStateKeepsLive, appendWindow, normalizeRealtimeMessage } from "@/lib/beszel-realtime";
import type { BeszelContainerStatsPoint, BeszelStatsPoint } from "@/lib/types";
import { openBeszelRealtime, type RealtimeStatus } from "@/services/beszel-realtime";

interface LiveBuffers {
  stats: BeszelStatsPoint[];
  containers: BeszelContainerStatsPoint[];
}

const EMPTY: LiveBuffers = { stats: [], containers: [] };

function useAppActive(): boolean {
  const [active, setActive] = useState(appStateKeepsLive(AppState.currentState));
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(appStateKeepsLive(s)));
    return () => sub.remove();
  }, []);
  return active;
}

/**
 * The Live view's 1-second stream for one system. The connection exists only
 * while `active` is true, this screen is focused and the app is in the
 * foreground — leaving or backgrounding closes it, so the hub stops polling
 * the agent — and each (re)open starts from an empty 60-second window rather
 * than splicing across the gap.
 */
export function useBeszelRealtime(systemId: string | undefined, active: boolean, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("beszel", instanceId);
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [buffers, setBuffers] = useState<LiveBuffers>(EMPTY);
  const [status, setStatus] = useState<RealtimeStatus | null>(null);
  const on = active && focused && appActive && enabled && !!id && !!systemId;

  useEffect(() => {
    if (!on) {
      setStatus(null);
      return;
    }
    setBuffers(EMPTY);
    const close = openBeszelRealtime({
      systemId: systemId as string,
      instanceId: id ?? undefined,
      onStatus: setStatus,
      onData: (data) => {
        const point = normalizeRealtimeMessage(data, Date.now());
        if (!point) return;
        setBuffers((prev) => ({
          stats: appendWindow(prev.stats, point.stats),
          containers: point.containers ? appendWindow(prev.containers, point.containers) : prev.containers,
        }));
      },
    });
    return close;
  }, [on, systemId, id]);

  return { stats: buffers.stats, containers: buffers.containers, status };
}
