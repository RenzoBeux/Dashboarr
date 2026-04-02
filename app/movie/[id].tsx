import { View, Text, Image, ScrollView, Alert } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Trash2, Star } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRadarrMovie, useDeleteMovie } from "@/hooks/use-radarr";
import { formatBytes } from "@/lib/utils";

export default function MovieDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: movie, isLoading } = useRadarrMovie(Number(id));
  const deleteMutation = useDeleteMovie();

  if (isLoading || !movie) {
    return (
      <ScreenWrapper>
        <Text className="text-zinc-400 text-center mt-10">
          {isLoading ? "Loading..." : "Movie not found"}
        </Text>
      </ScreenWrapper>
    );
  }

  const poster = movie.images.find((i) => i.coverType === "poster");
  const fanart = movie.images.find((i) => i.coverType === "fanart");
  const posterUrl = poster?.remoteUrl || poster?.url;
  const fanartUrl = fanart?.remoteUrl || fanart?.url;

  const handleDelete = () => {
    Alert.alert("Delete Movie", `Remove "${movie.title}" from Radarr?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ id: movie.id });
          router.back();
        },
      },
      {
        text: "Remove + Files",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate({ id: movie.id, deleteFiles: true });
          router.back();
        },
      },
    ]);
  };

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
