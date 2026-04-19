import { useState, useMemo } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  useSonarrSeriesById,
  useSonarrEpisodes,
  useSonarrEpisodeFiles,
  useToggleEpisodeMonitored,
} from "@/hooks/use-sonarr";
import { formatEpisodeCode, formatBytes, formatAudioChannels, formatResolution } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import type { SonarrEpisode, SonarrEpisodeFile, SonarrSeason } from "@/lib/types";

export default function SeriesDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: series, isLoading } = useSonarrSeriesById(Number(id));
  const { data: episodes } = useSonarrEpisodes(Number(id));
  const { data: episodeFiles } = useSonarrEpisodeFiles(Number(id));

  const episodeFileMap = useMemo(() => {
    const map = new Map<number, SonarrEpisodeFile>();
    episodeFiles?.forEach((f) => map.set(f.id, f));
    return map;
  }, [episodeFiles]);
  const fanartOpacity = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const fanartStyle = useAnimatedStyle(() => ({ opacity: withTiming(fanartOpacity.value, { duration: 400 }) }));
  const posterStyle = useAnimatedStyle(() => ({ opacity: withTiming(posterOpacity.value, { duration: 400 }) }));

  const poster = series?.images.find((i) => i.coverType === "poster");
  const fanart = series?.images.find((i) => i.coverType === "fanart");
  const seasonCount =
    series?.statistics?.seasonCount ??
    series?.seasons.filter((s) => s.seasonNumber > 0).length ??
    0;
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "sonarr");
  const { src: fanartUrl, onError: onFanartError } = useServiceImage(fanart, "sonarr");

  if (isLoading || !series) {
    return (
      <ScreenWrapper>
        {isLoading ? (
          <View>
            <Skeleton width="100%" height={192} borderRadius={16} />
            <View className="flex-row gap-4 mt-4">
              <Skeleton width={96} height={144} borderRadius={12} />
              <View className="flex-1 gap-2 justify-center">
                <Skeleton width="80%" height={20} borderRadius={6} />
                <Skeleton width="40%" height={14} borderRadius={4} />
                <Skeleton width="60%" height={24} borderRadius={12} />
              </View>
            </View>
          </View>
        ) : (
          <Text className="text-zinc-400 text-center mt-10">Series not found</Text>
        )}
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      {fanartUrl && (
        <Animated.View style={fanartStyle} className="mb-4">
          <Image
            source={{ uri: fanartUrl }}
            className="w-full h-48 rounded-2xl"
            resizeMode="cover"
            onLoad={() => { fanartOpacity.value = 1; }}
            onError={onFanartError}
          />
        </Animated.View>
      )}

      <View className="flex-row gap-4 mb-4">
        {posterUrl && (
          <Animated.View style={posterStyle}>
            <Image
              source={{ uri: posterUrl }}
              className="w-24 h-36 rounded-xl bg-surface-light"
              resizeMode="cover"
              onLoad={() => { posterOpacity.value = 1; }}
              onError={onPosterError}
            />
          </Animated.View>
        )}
        <View className="flex-1 justify-center">
          <Text className="text-zinc-100 text-xl font-bold">{series.title}</Text>
          <Text className="text-zinc-500 text-sm mt-1">
            {series.year} · {series.network}
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Badge
              label={`${seasonCount} Season${seasonCount !== 1 ? "s" : ""}`}
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
        <InfoRow label="Size on Disk" value={formatBytes(series.statistics?.sizeOnDisk ?? series.sizeOnDisk)} />
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
              episodeFileMap={episodeFileMap}
            />
          ))}
      </View>
    </ScreenWrapper>
  );
}

function SeasonAccordion({
  season,
  episodes,
  episodeFileMap,
}: {
  season: SonarrSeason;
  episodes?: SonarrEpisode[];
  episodeFileMap: Map<number, SonarrEpisodeFile>;
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
              <EpisodeRow key={ep.id} episode={ep} episodeFile={ep.episodeFileId ? episodeFileMap.get(ep.episodeFileId) : undefined} />
            ))}
        </View>
      )}
    </Card>
  );
}

function EpisodeRow({ episode, episodeFile }: { episode: SonarrEpisode; episodeFile?: SonarrEpisodeFile }) {
  const toggleMonitored = useToggleEpisodeMonitored();
  const mediaInfo = episodeFile?.mediaInfo;

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
        {mediaInfo ? (
          <Text className="text-zinc-600 text-[10px]">
            {formatResolution(mediaInfo.resolution)} · {mediaInfo.videoCodec} · {mediaInfo.audioCodec} {formatAudioChannels(mediaInfo.audioChannels)}
            {mediaInfo.videoDynamicRangeType ? ` · ${mediaInfo.videoDynamicRangeType}` : ""}
          </Text>
        ) : episode.airDate ? (
          <Text className="text-zinc-600 text-[10px]">{episode.airDate}</Text>
        ) : null}
      </View>
      <Pressable
        onPress={() =>
          toggleMonitored.mutate({
            episodeId: episode.id,
            monitored: !episode.monitored,
          })
        }
        disabled={toggleMonitored.isPending}
        className={`p-1 active:opacity-70 ${toggleMonitored.isPending ? "opacity-50" : ""}`}
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
