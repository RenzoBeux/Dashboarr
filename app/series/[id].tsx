import { useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  useSonarrSeriesById,
  useSonarrEpisodes,
  useToggleEpisodeMonitored,
} from "@/hooks/use-sonarr";
import { formatEpisodeCode, formatBytes } from "@/lib/utils";
import type { SonarrEpisode, SonarrSeason } from "@/lib/types";

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: series, isLoading } = useSonarrSeriesById(Number(id));
  const { data: episodes } = useSonarrEpisodes(Number(id));

  if (isLoading || !series) {
    return (
      <ScreenWrapper>
        <Text className="text-zinc-400 text-center mt-10">
          {isLoading ? "Loading..." : "Series not found"}
        </Text>
      </ScreenWrapper>
    );
  }

  const poster = series.images.find((i) => i.coverType === "poster");
  const fanart = series.images.find((i) => i.coverType === "fanart");
  const posterUrl = poster?.remoteUrl || poster?.url;
  const fanartUrl = fanart?.remoteUrl || fanart?.url;

  return (
    <ScreenWrapper>
      {/* Backdrop */}
      {fanartUrl && (
        <Image
          source={{ uri: fanartUrl }}
          className="w-full h-48 rounded-2xl mb-4"
          resizeMode="cover"
        />
      )}

      {/* Header */}
      <View className="flex-row gap-4 mb-4">
        {posterUrl && (
          <Image
            source={{ uri: posterUrl }}
            className="w-24 h-36 rounded-xl bg-surface-light"
            resizeMode="cover"
          />
        )}
        <View className="flex-1 justify-center">
          <Text className="text-zinc-100 text-xl font-bold">{series.title}</Text>
          <Text className="text-zinc-500 text-sm mt-1">
            {series.year} · {series.network}
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Badge
              label={`${series.seasonCount} Season${series.seasonCount !== 1 ? "s" : ""}`}
              variant="default"
            />
            {series.monitored && <Badge label="Monitored" variant="downloading" />}
          </View>
          <Text className="text-zinc-400 text-xs mt-2">
            {series.episodeFileCount}/{series.totalEpisodeCount} episodes
          </Text>
        </View>
      </View>

      {/* Overview */}
      {series.overview && (
        <Card className="mb-4">
          <Text className="text-zinc-300 text-sm leading-5">{series.overview}</Text>
        </Card>
      )}

      {/* Info */}
      <Card className="mb-4 gap-2">
        <InfoRow label="Status" value={series.status} />
        <InfoRow label="Size on Disk" value={formatBytes(series.sizeOnDisk)} />
        <InfoRow label="Root Folder" value={series.rootFolderPath} />
      </Card>

      {/* Seasons */}
      <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2 ml-1">
        Seasons
      </Text>
      <View className="gap-2">
        {series.seasons
          .sort((a, b) => b.seasonNumber - a.seasonNumber)
          .map((season) => (
            <SeasonAccordion
              key={season.seasonNumber}
              season={season}
              episodes={episodes?.filter(
                (ep) => ep.seasonNumber === season.seasonNumber,
              )}
            />
          ))}
      </View>
    </ScreenWrapper>
  );
}

function SeasonAccordion({
  season,
  episodes,
}: {
  season: SonarrSeason;
  episodes?: SonarrEpisode[];
}) {
  const [expanded, setExpanded] = useState(false);
  const stats = season.statistics;
  const progress = stats ? stats.percentOfEpisodes / 100 : 0;

  return (
    <Card>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        className="flex-row items-center justify-between"
      >
        <View className="flex-row items-center gap-2">
          {expanded ? (
            <ChevronDown size={16} color="#71717a" />
          ) : (
            <ChevronRight size={16} color="#71717a" />
          )}
          <Text className="text-zinc-200 text-sm font-medium">
            {season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`}
          </Text>
        </View>
        {stats && (
          <Text className="text-zinc-500 text-xs">
            {stats.episodeFileCount}/{stats.episodeCount}
          </Text>
        )}
      </Pressable>

      {stats && <ProgressBar progress={progress} className="mt-2" />}

      {expanded && episodes && (
        <View className="mt-3 gap-1">
          {episodes
            .sort((a, b) => a.episodeNumber - b.episodeNumber)
            .map((ep) => (
              <EpisodeRow key={ep.id} episode={ep} />
            ))}
        </View>
      )}
    </Card>
  );
}

function EpisodeRow({ episode }: { episode: SonarrEpisode }) {
  const toggleMonitored = useToggleEpisodeMonitored();

  return (
    <View className="flex-row items-center py-1.5 border-b border-border/30">
      <View
        className={`w-1.5 h-6 rounded-full mr-2 ${
          episode.hasFile ? "bg-success" : "bg-zinc-600"
        }`}
      />
      <View className="flex-1">
        <Text className="text-zinc-300 text-xs" numberOfLines={1}>
          {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} —{" "}
          {episode.title}
        </Text>
        {episode.airDate && (
          <Text className="text-zinc-600 text-[10px]">{episode.airDate}</Text>
        )}
      </View>
      <Pressable
        onPress={() =>
          toggleMonitored.mutate({
            episodeId: episode.id,
            monitored: !episode.monitored,
          })
        }
        className="p-1 active:opacity-70"
        hitSlop={6}
      >
        {episode.monitored ? (
          <Check size={14} color="#3b82f6" />
        ) : (
          <X size={14} color="#71717a" />
        )}
      </Pressable>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between">
      <Text className="text-zinc-500 text-sm">{label}</Text>
      <Text className="text-zinc-300 text-sm">{value}</Text>
    </View>
  );
}
