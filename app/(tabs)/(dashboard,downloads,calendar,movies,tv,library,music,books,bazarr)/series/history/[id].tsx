import { View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ArrHistoryList } from "@/components/common/arr-history-list";
import { useSonarrEpisodeHistory } from "@/hooks/use-sonarr";
import { normalizeSonarrHistory } from "@/lib/arr-history";

// `id` is the Sonarr episodeId; `title` is a pre-formatted label (e.g. "S02E04")
// passed by the caller so we don't need to re-fetch the episode for the header.
export default function EpisodeHistoryScreen() {
  const { id, instanceId, title } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
    title?: string;
  }>();
  const episodeId = Number(id);
  const query = useSonarrEpisodeHistory(episodeId, instanceId);

  const heading = title ? `History · ${title}` : "History";

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title={heading} />
      <View className="flex-1">
        <ArrHistoryList query={query} normalize={normalizeSonarrHistory} />
      </View>
    </ScreenWrapper>
  );
}
