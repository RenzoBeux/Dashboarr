import { View, Text } from "react-native";
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
import { useConfigStore } from "@/store/config-store";
import { CardErrorBoundary } from "@/components/common/error-boundary";

export default function DashboardScreen() {
  const { refreshing, onRefresh } = usePullToRefresh();
  const services = useConfigStore((s) => s.services);

  const hasAnyEnabled = Object.values(services).some((s) => s.enabled);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <Text className="text-zinc-100 text-2xl font-bold mt-2 mb-4">
        Dashboarr
      </Text>

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
          {services.qbittorrent.enabled && (
            <CardErrorBoundary><SpeedStatsCard /></CardErrorBoundary>
          )}
          <CardErrorBoundary><ServiceHealthCard /></CardErrorBoundary>
          {services.qbittorrent.enabled && (
            <CardErrorBoundary><DownloadCard /></CardErrorBoundary>
          )}
          {services.radarr.enabled && (
            <CardErrorBoundary><RadarrQueueCard /></CardErrorBoundary>
          )}
          {services.sonarr.enabled && (
            <CardErrorBoundary><SonarrCalendarCard /></CardErrorBoundary>
          )}
          {services.tautulli.enabled && (
            <CardErrorBoundary><TautulliActivityCard /></CardErrorBoundary>
          )}
          {services.overseerr.enabled && (
            <CardErrorBoundary><OverseerrRequestsCard /></CardErrorBoundary>
          )}
          {services.plex.enabled && (
            <CardErrorBoundary><PlexNowPlayingCard /></CardErrorBoundary>
          )}
          {services.prowlarr.enabled && (
            <CardErrorBoundary><ProwlarrStatsCard /></CardErrorBoundary>
          )}
        </View>
      )}
    </ScreenWrapper>
  );
}
