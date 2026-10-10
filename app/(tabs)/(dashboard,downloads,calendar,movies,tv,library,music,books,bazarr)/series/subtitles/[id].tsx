import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SubtitleResultsPicker } from "@/components/subtitles/subtitle-results-picker";

/** Bazarr manual subtitle search for one Sonarr episode. */
export default function EpisodeSubtitleSearchScreen() {
  const { id, episodeId, bazarrId, title } = useLocalSearchParams<{
    id: string;
    episodeId: string;
    bazarrId: string;
    // "S01E02", passed by the caller for the header.
    title?: string;
  }>();

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={title ? `Subtitles · ${title}` : "Subtitles"} />
      <View className="flex-1">
        <SubtitleResultsPicker
          bazarrId={bazarrId}
          target={{ type: "episode", seriesId: Number(id), episodeId: Number(episodeId) }}
        />
      </View>
    </ScreenWrapper>
  );
}
