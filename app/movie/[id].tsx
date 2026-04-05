import { View, Text, Image, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2, Star } from "lucide-react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRadarrMovie, useDeleteMovie } from "@/hooks/use-radarr";
import { useServiceImage } from "@/hooks/use-service-image";
import { formatBytes, formatAudioChannels, formatResolution } from "@/lib/utils";
import type { MediaInfo } from "@/lib/types";

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: movie, isLoading } = useRadarrMovie(Number(id));
  const deleteMutation = useDeleteMovie();
  const fanartOpacity = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const fanartStyle = useAnimatedStyle(() => ({ opacity: withTiming(fanartOpacity.value, { duration: 400 }) }));
  const posterStyle = useAnimatedStyle(() => ({ opacity: withTiming(posterOpacity.value, { duration: 400 }) }));

  const poster = movie?.images.find((i) => i.coverType === "poster");
  const fanart = movie?.images.find((i) => i.coverType === "fanart");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "radarr");
  const { src: fanartUrl, onError: onFanartError } = useServiceImage(fanart, "radarr");

  if (isLoading || !movie) {
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
          <Text className="text-zinc-400 text-center mt-10">Movie not found</Text>
        )}
      </ScreenWrapper>
    );
  }

  const handleDelete = () => {
    Alert.alert("Delete Movie", `Remove "${movie.title}" from Radarr?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ id: movie.id, tmdbId: movie.tmdbId });
          router.back();
        },
      },
      {
        text: "Remove + Files",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ id: movie.id, deleteFiles: true, tmdbId: movie.tmdbId });
          router.back();
        },
      },
    ]);
  };

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
          <Text className="text-zinc-100 text-xl font-bold">{movie.title}</Text>
          <Text className="text-zinc-500 text-sm mt-1">{movie.year}</Text>
          <View className="flex-row gap-2 mt-2">
            <Badge
              label={movie.hasFile ? "Downloaded" : "Missing"}
              variant={movie.hasFile ? "success" : "missing"}
            />
            {movie.monitored && <Badge label="Monitored" variant="downloading" />}
          </View>
          {movie.ratings.value > 0 && (
            <View className="flex-row items-center gap-1 mt-2">
              <Star size={14} color="#f59e0b" fill="#f59e0b" />
              <Text className="text-zinc-400 text-sm">
                {movie.ratings.value.toFixed(1)}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* Overview */}
      {movie.overview && (
        <Card className="mb-4">
          <Text className="text-zinc-400 text-xs font-semibold uppercase mb-2">
            Overview
          </Text>
          <Text className="text-zinc-300 text-sm leading-5">
            {movie.overview}
          </Text>
        </Card>
      )}

      {/* Info */}
      <Card className="mb-4 gap-2">
        <InfoRow label="Runtime" value={`${movie.runtime} min`} />
        <InfoRow label="Status" value={movie.status} />
        <InfoRow label="Size on Disk" value={formatBytes(movie.sizeOnDisk)} />
        <InfoRow label="Root Folder" value={movie.rootFolderPath} />
      </Card>

      {/* Media Info */}
      {movie.hasFile && movie.movieFile?.mediaInfo && (
        <MediaInfoCard mediaInfo={movie.movieFile.mediaInfo} qualityName={movie.movieFile.quality.quality.name} />
      )}

      {/* Actions */}
      <Button
        label="Delete Movie"
        variant="danger"
        onPress={handleDelete}
        icon={<Trash2 size={16} color="white" />}
      />
    </ScreenWrapper>
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

function MediaInfoCard({ mediaInfo, qualityName }: { mediaInfo: MediaInfo; qualityName: string }) {
  const resolution = formatResolution(mediaInfo.resolution);
  const audioChannels = formatAudioChannels(mediaInfo.audioChannels);

  const dynamicRange = mediaInfo.videoDynamicRangeType || mediaInfo.videoDynamicRange;

  return (
    <Card className="mb-4 gap-2">
      <Text className="text-zinc-400 text-xs font-semibold uppercase mb-1">
        Media Info
      </Text>
      <InfoRow label="Quality" value={qualityName} />
      <InfoRow label="Video" value={`${mediaInfo.videoCodec} · ${resolution}`} />
      {dynamicRange ? <InfoRow label="Dynamic Range" value={dynamicRange} /> : null}
      <InfoRow label="Audio" value={`${mediaInfo.audioCodec} · ${audioChannels}`} />
    </Card>
  );
}
