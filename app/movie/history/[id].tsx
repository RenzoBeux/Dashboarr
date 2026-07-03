import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ArrHistoryList } from "@/components/common/arr-history-list";
import { useRadarrMovie, useRadarrMovieHistory } from "@/hooks/use-radarr";
import { normalizeRadarrHistory } from "@/lib/arr-history";

export default function MovieHistoryScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const movieId = Number(id);
  const { data: movie } = useRadarrMovie(movieId, instanceId);
  const query = useRadarrMovieHistory(movieId, instanceId);

  const title = movie ? `History · ${movie.title}` : "History";

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={title} />
      <View className="flex-1">
        <ArrHistoryList query={query} normalize={normalizeRadarrHistory} />
      </View>
    </ScreenWrapper>
  );
}
