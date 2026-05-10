import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ReleasesPicker } from "@/components/common/releases-picker";
import { useRadarrMovie, useRadarrReleases } from "@/hooks/use-radarr";

export default function MovieReleasesScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const movieId = Number(id);
  const { data: movie } = useRadarrMovie(movieId, instanceId);
  const query = useRadarrReleases(movieId, instanceId);

  const title = movie ? `Releases · ${movie.title}` : "Releases";

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={title} />
      <View className="flex-1">
        <ReleasesPicker service="radarr" query={query} instanceId={instanceId} />
      </View>
    </ScreenWrapper>
  );
}
