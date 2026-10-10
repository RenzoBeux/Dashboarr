import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  UserSearch,
  Trash2,
  Bookmark,
  MoreHorizontal,
  History,
  Captions,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  useToggleEpisodeMonitored,
  useDeleteEpisodeFile,
  useSearchForEpisodes,
} from "@/hooks/use-sonarr";
import {
  airDateKey,
  formatEpisodeCode,
  formatAudioChannels,
  formatResolution,
} from "@/lib/utils";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { sonarrEpisodeBarKind, BAR_KIND_COLOR } from "@/lib/arr-poster-status";
import type { SonarrEpisode, SonarrEpisodeFile } from "@/lib/types";
import { LanguageLines } from "@/components/subtitles/language-lines";
import type { AudioTag, SubtitleChip } from "@/lib/subtitle-model";

/**
 * One episode inside a season on the series detail page: status spine, code +
 * title, the file's media line (or the air date), the monitor toggle and the
 * "⋯" sheet (automatic/interactive search, history, delete file).
 */
export function EpisodeRow({
  seriesId,
  instanceId,
  episode,
  episodeFile,
  isDownloading,
  languages,
  onOpenSubtitles,
}: {
  seriesId: number;
  instanceId?: string;
  episode: SonarrEpisode;
  episodeFile?: SonarrEpisodeFile;
  isDownloading: boolean;
  // Audio + subtitle tags, when a Bazarr instance serves this series.
  languages?: { audio: AudioTag[]; chips: SubtitleChip[] };
  onOpenSubtitles?: () => void;
}) {
  const router = useRouter();
  const toggleMonitored = useToggleEpisodeMonitored(instanceId);
  const searchEpisode = useSearchForEpisodes(instanceId);
  const deleteFile = useDeleteEpisodeFile(instanceId);
  const flow = useModalFlow<{ menu: void; confirmDeleteFile: void }>();
  const mediaInfo = episodeFile?.mediaInfo;
  // Local day of airDateUtc, matching Sonarr web's episode list (issue #86).
  const airLabel = airDateKey(episode);

  // Search/delete live in the "⋯" sheet so the row stays uncluttered and the
  // automatic-vs-interactive search distinction reads clearly as labeled rows.
  const episodeActions: ActionSheetAction[] = [
    {
      label: "Automatic Search",
      icon: <Icon icon={Search} size={20} color="#a1a1aa" />,
      onPress: () => searchEpisode.mutate([episode.id]),
    },
    {
      label: "Interactive Search",
      icon: <Icon icon={UserSearch} size={20} color="#a1a1aa" />,
      onPress: () =>
        flow.whenClear(() =>
          router.push(
            `/series/releases/${seriesId}?episodeId=${episode.id}${
              instanceId ? `&instanceId=${instanceId}` : ""
            }`,
          ),
        ),
    },
    ...(onOpenSubtitles
      ? [
          {
            label: "Subtitles",
            icon: <Icon icon={Captions} size={20} color="#a1a1aa" />,
            onPress: () => flow.whenClear(onOpenSubtitles),
          },
        ]
      : []),
    {
      label: "History",
      icon: <Icon icon={History} size={20} color="#a1a1aa" />,
      onPress: () =>
        flow.whenClear(() =>
          router.push(
            `/series/history/${episode.id}?title=${encodeURIComponent(
              formatEpisodeCode(episode.seasonNumber, episode.episodeNumber),
            )}${instanceId ? `&instanceId=${instanceId}` : ""}`,
          ),
        ),
    },
    ...(episodeFile
      ? [
          {
            label: "Delete File",
            icon: <Icon icon={Trash2} size={20} color="#ef4444" />,
            variant: "danger" as const,
            onPress: () => flow.open("confirmDeleteFile"),
          },
        ]
      : []),
  ];

  return (
    <>
      <View className="flex-row items-center py-1.5 border-b border-border/30">
        <View
          className="w-1.5 h-6 rounded-full mr-2"
          style={{
            backgroundColor:
              BAR_KIND_COLOR[sonarrEpisodeBarKind(episode, isDownloading)],
          }}
        />
        <View className="flex-1">
          <Text className="text-zinc-300 text-xs" numberOfLines={1}>
            {formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)} —{" "}
            {episode.title}
          </Text>
          {mediaInfo ? (
            <Text className="text-zinc-600 text-xs">
              {formatResolution(mediaInfo.resolution)} · {mediaInfo.videoCodec}{" "}
              · {mediaInfo.audioCodec}{" "}
              {formatAudioChannels(mediaInfo.audioChannels)}
              {mediaInfo.videoDynamicRangeType
                ? ` · ${mediaInfo.videoDynamicRangeType}`
                : ""}
            </Text>
          ) : airLabel ? (
            <Text className="text-zinc-600 text-xs">{airLabel}</Text>
          ) : null}
          {languages ? (
            <View className="mt-0.5">
              <LanguageLines
                audio={languages.audio}
                subtitles={languages.chips}
                onPress={onOpenSubtitles}
                accessibilityLabel={`${formatEpisodeCode(
                  episode.seasonNumber,
                  episode.episodeNumber,
                )} subtitles`}
              />
            </View>
          ) : null}
        </View>
        <View className="flex-row items-center gap-1">
          <Pressable
            onPress={() =>
              toggleMonitored.mutate({
                episodeId: episode.id,
                monitored: !episode.monitored,
              })
            }
            disabled={toggleMonitored.isPending}
            className={`p-2 active:opacity-70 ${toggleMonitored.isPending ? "opacity-50" : ""}`}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={
              episode.monitored
                ? "Monitored — tap to unmonitor"
                : "Not monitored — tap to monitor"
            }
          >
            <Icon
              icon={Bookmark}
              size={18}
              color={episode.monitored ? "#3b82f6" : "#52525b"}
              fill={episode.monitored ? "#3b82f6" : "transparent"}
            />
          </Pressable>
          <Pressable
            onPress={() => flow.open("menu")}
            hitSlop={8}
            className="p-2 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Episode actions"
          >
            <Icon icon={MoreHorizontal} size={18} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>

      <ActionSheet
        {...flow.bind("menu")}
        title={formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)}
        subtitle={episode.title}
        actions={episodeActions}
      />

      <ConfirmModal
        {...flow.bind("confirmDeleteFile")}
        title="Delete Episode File"
        message={`Delete the file for ${formatEpisodeCode(
          episode.seasonNumber,
          episode.episodeNumber,
        )}? The episode stays in the library but will be marked missing.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          flow.close();
          if (episodeFile) deleteFile.mutate(episodeFile.id);
        }}
      />
    </>
  );
}
