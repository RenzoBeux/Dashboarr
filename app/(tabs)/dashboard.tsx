import { useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { GripVertical, ChevronUp, ChevronDown, Pencil, Check } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { SpeedStatsCard } from "@/components/dashboard/speed-stats-card";
import { ServiceHealthCard } from "@/components/dashboard/service-health-card";
import { DownloadCard } from "@/components/dashboard/download-card";
import { RadarrQueueCard } from "@/components/dashboard/radarr-queue-card";
import { SonarrCalendarCard } from "@/components/dashboard/sonarr-calendar-card";
import { OverseerrRequestsCard } from "@/components/dashboard/overseerr-requests-card";
import { TautulliActivityCard } from "@/components/dashboard/tautulli-activity-card";
import { ProwlarrStatsCard } from "@/components/dashboard/prowlarr-stats-card";
import { PlexNowPlayingCard } from "@/components/dashboard/plex-now-playing-card";
import { ServerStatsCard } from "@/components/dashboard/server-stats-card";
import { useConfigStore } from "@/store/config-store";
import { CardErrorBoundary } from "@/components/common/error-boundary";
import type { DashboardCardId, ServiceId } from "@/lib/constants";

const CARD_REGISTRY: Record<
  DashboardCardId,
  { label: string; component: React.ComponentType; service: ServiceId | null }
> = {
  "server-stats": { label: "Server Stats", component: ServerStatsCard, service: "glances" },
  "speed-stats": { label: "Speed Stats", component: SpeedStatsCard, service: "qbittorrent" },
  "service-health": { label: "Service Health", component: ServiceHealthCard, service: null },
  "downloads": { label: "Downloads", component: DownloadCard, service: "qbittorrent" },
  "radarr-queue": { label: "Radarr Queue", component: RadarrQueueCard, service: "radarr" },
  "sonarr-calendar": { label: "Sonarr Calendar", component: SonarrCalendarCard, service: "sonarr" },
  "tautulli-activity": { label: "Tautulli Activity", component: TautulliActivityCard, service: "tautulli" },
  "overseerr-requests": { label: "Overseerr Requests", component: OverseerrRequestsCard, service: "overseerr" },
  "plex-now-playing": { label: "Plex Now Playing", component: PlexNowPlayingCard, service: "plex" },
  "prowlarr-stats": { label: "Prowlarr Stats", component: ProwlarrStatsCard, service: "prowlarr" },
};

export default function DashboardScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const services = useConfigStore((s) => s.services);
  const dashboardOrder = useConfigStore((s) => s.dashboardOrder);
  const setDashboardOrder = useConfigStore((s) => s.setDashboardOrder);
  const [editMode, setEditMode] = useState(false);

  const hasAnyEnabled = Object.values(services).some((s) => s.enabled);

  const visibleCards = dashboardOrder.filter((id) => {
    const { service } = CARD_REGISTRY[id];
    return service === null || services[service].enabled;
  });

  function moveCard(cardId: DashboardCardId, direction: "up" | "down") {
    const visibleIndex = visibleCards.indexOf(cardId);
    const targetVisibleIndex = direction === "up" ? visibleIndex - 1 : visibleIndex + 1;
    if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleCards.length) return;

    const targetId = visibleCards[targetVisibleIndex];
    const newOrder = [...dashboardOrder];
    const aIdx = newOrder.indexOf(cardId);
    const bIdx = newOrder.indexOf(targetId);
    [newOrder[aIdx], newOrder[bIdx]] = [newOrder[bIdx], newOrder[aIdx]];

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDashboardOrder(newOrder);
  }

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between mt-2 mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Dashboarr</Text>
        {hasAnyEnabled && (
          <TouchableOpacity
            onPress={() => setEditMode((e) => !e)}
            className="p-2"
            hitSlop={8}
          >
            {editMode ? (
              <Check size={20} color="#22c55e" />
            ) : (
              <Pencil size={18} color="#71717a" />
            )}
          </TouchableOpacity>
        )}
      </View>

      {!hasAnyEnabled ? (
        <View className="flex-1 items-center justify-center py-20">
          <Text className="text-zinc-400 text-base text-center">
            No services configured yet.
          </Text>
          <Text className="text-zinc-500 text-sm text-center mt-1">
            Go to Settings to add your first service.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          {visibleCards.map((id, visibleIndex) => {
            const { component: Card, label } = CARD_REGISTRY[id];
            const isFirst = visibleIndex === 0;
            const isLast = visibleIndex === visibleCards.length - 1;

            return (
              <View key={id}>
                {editMode && (
                  <View className="flex-row items-center justify-between mb-1 px-1">
                    <View className="flex-row items-center gap-1.5">
                      <GripVertical size={14} color="#52525b" />
                      <Text className="text-zinc-500 text-xs font-medium">{label}</Text>
                    </View>
                    <View className="flex-row gap-1">
                      <TouchableOpacity
                        onPress={() => moveCard(id, "up")}
                        disabled={isFirst}
                        className="p-1"
                        hitSlop={6}
                      >
                        <ChevronUp size={18} color={isFirst ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => moveCard(id, "down")}
                        disabled={isLast}
                        className="p-1"
                        hitSlop={6}
                      >
                        <ChevronDown size={18} color={isLast ? "#3f3f46" : "#a1a1aa"} />
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <CardErrorBoundary>
                  <Card />
                </CardErrorBoundary>
              </View>
            );
          })}
        </View>
      )}
    </ScreenWrapper>
  );
}
