import { useMemo } from "react";
import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ReleasesPicker } from "@/components/common/releases-picker";
import {
  useSonarrSeriesById,
  useSonarrEpisodes,
  useSonarrReleasesForEpisode,
  useSonarrReleasesForSeason,
} from "@/hooks/use-sonarr";
import { formatEpisodeCode } from "@/lib/utils";

export default function SeriesReleasesScreen() {
  const params = useLocalSearchParams<{
    id: string;
    episodeId?: string;
    seasonNumber?: string;
    instanceId?: string;
  }>();
  const seriesId = Number(params.id);
  const episodeId = params.episodeId ? Number(params.episodeId) : 0;
  const seasonNumber =
    params.seasonNumber !== undefined ? Number(params.seasonNumber) : NaN;
  const instanceId = params.instanceId;

  const mode: "episode" | "season" = episodeId > 0 ? "episode" : "season";

  const { data: series } = useSonarrSeriesById(seriesId, instanceId);
  // Episode metadata is needed for the title in episode mode; the list is
  // already cached from the series detail screen so this is usually free.
  const { data: episodes } = useSonarrEpisodes(
    mode === "episode" ? seriesId : 0,
    instanceId,
  );

  const episodeQuery = useSonarrReleasesForEpisode(
    mode === "episode" ? episodeId : 0,
    instanceId,
  );
  const seasonQuery = useSonarrReleasesForSeason(
    mode === "season" ? seriesId : 0,
    mode === "season" ? seasonNumber : -1,
    instanceId,
  );
  const query = mode === "episode" ? episodeQuery : seasonQuery;

  const title = useMemo(() => {
    if (mode === "episode") {
      const ep = episodes?.find((e) => e.id === episodeId);
      if (ep) {
        return `${formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)} — ${ep.title}`;
      }
      return "Episode releases";
    }
    const seasonLabel =
      seasonNumber === 0 ? "Specials" : `Season ${seasonNumber}`;
    return series ? `${seasonLabel} · ${series.title}` : seasonLabel;
  }, [mode, episodes, episodeId, series, seasonNumber]);

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={title} />
      <View className="flex-1">
        <ReleasesPicker service="sonarr" query={query} instanceId={instanceId} />
      </View>
    </ScreenWrapper>
  );
}
