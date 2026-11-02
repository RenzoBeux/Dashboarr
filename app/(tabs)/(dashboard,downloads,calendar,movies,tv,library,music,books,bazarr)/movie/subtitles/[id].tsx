import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SubtitleResultsPicker } from "@/components/subtitles/subtitle-results-picker";
import { useRadarrMovie } from "@/hooks/use-radarr";

/** Bazarr manual subtitle search for one Radarr movie. */
export default function MovieSubtitleSearchScreen() {
  const { id, instanceId, bazarrId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
    bazarrId: string;
  }>();
  const radarrId = Number(id);
  const { data: movie } = useRadarrMovie(radarrId, instanceId);

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={movie ? `Subtitles · ${movie.title}` : "Subtitles"} />
      <View className="flex-1">
        <SubtitleResultsPicker bazarrId={bazarrId} target={{ type: "movie", radarrId }} />
      </View>
    </ScreenWrapper>
  );
}
