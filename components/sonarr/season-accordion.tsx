import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  UserSearch,
  Trash2,
  Bookmark,
  BookmarkX,
  MoreHorizontal,
  Captions,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import {
  ActionSheet,
  type ActionSheetAction,
} from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { EpisodeRow } from "@/components/sonarr/episode-row";
import {
  useToggleSeasonMonitored,
  useDeleteEpisodeFiles,
  useSearchForSeason,
} from "@/hooks/use-sonarr";
import { formatBytes } from "@/lib/utils";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { BAR_KIND_COLOR } from "@/lib/arr-poster-status";
import type {
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeason,
} from "@/lib/types";
import type { EpisodeLanguages } from "@/lib/subtitle-model";

/**
 * One season on the series detail page: a collapsible card with the season's
 * file count, monitor toggle and "⋯" sheet (search, monitor, delete files),
 * a progress bar, and the episode rows when expanded.
 */
export function SeasonAccordion({
  seriesId,
  instanceId,
  season,
  episodes,
  episodeFileMap,
  downloadingEpisodeIds,
  episodeLanguages,
  subtitleGaps = 0,
  onOpenSubtitles,
  onSearchMissingSubtitles,
}: {
  seriesId: number;
  instanceId?: string;
  season: SonarrSeason;
  episodes?: SonarrEpisode[];
  episodeFileMap: Map<number, SonarrEpisodeFile>;
  downloadingEpisodeIds: Set<number>;
  // The rest is set only when a Bazarr instance serves this series.
  episodeLanguages?: Map<number, EpisodeLanguages>;
  // Episodes of this season missing at least one subtitle language.
  subtitleGaps?: number;
  onOpenSubtitles?: (episodeId: number) => void;
  onSearchMissingSubtitles?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const flow = useModalFlow<{ menu: void; confirmDeleteFiles: void }>();
  const searchSeason = useSearchForSeason(instanceId);
  const toggleSeason = useToggleSeasonMonitored(instanceId);
  const deleteSeasonFiles = useDeleteEpisodeFiles(instanceId);
  const stats = season.statistics;
  const progress = stats ? stats.percentOfEpisodes / 100 : 0;
  // Any episode of this season currently grabbing turns the season bar purple.
  const seasonDownloading = (episodes ?? []).some((ep) =>
    downloadingEpisodeIds.has(ep.id),
  );

  const seasonLabel =
    season.seasonNumber === 0 ? "Specials" : `Season ${season.seasonNumber}`;

  const releasesQuery = `seasonNumber=${season.seasonNumber}${
    instanceId ? `&instanceId=${instanceId}` : ""
  }`;

  // Every downloaded file in this season — what "Delete Files" removes in one
  // bulk request. Empty while the episode list is still loading, which also
  // keeps us from sending Sonarr an empty id list (it throws on that).
  const seasonFileIds = (episodes ?? [])
    .map((ep) => ep.episodeFileId)
    .filter((fileId): fileId is number => !!fileId);

  // Mirrors the episode "⋯" menu: automatic vs interactive search read clearly
  // as labeled rows instead of a bare magnifier icon.
  const seasonActions: ActionSheetAction[] = [
    {
      label: "Automatic Search",
      icon: <Icon icon={Search} size={20} color="#a1a1aa" />,
      onPress: () =>
        searchSeason.mutate({ seriesId, seasonNumber: season.seasonNumber }),
    },
    {
      label: "Interactive Search",
      icon: <Icon icon={UserSearch} size={20} color="#a1a1aa" />,
      onPress: () =>
        flow.whenClear(() =>
          router.push(`/series/releases/${seriesId}?${releasesQuery}`),
        ),
    },
    {
      label: season.monitored ? "Unmonitor Season" : "Monitor Season",
      // Sonarr cascades a season's monitored flag onto its episodes server-side
      // — worth saying, since the episode rows below carry their own toggles.
      subtitle: "Includes all episodes",
      icon: (
        <Icon
          icon={season.monitored ? BookmarkX : Bookmark}
          size={20}
          color={season.monitored ? "#a1a1aa" : "#3b82f6"}
        />
      ),
      disabled: toggleSeason.isPending,
      onPress: () =>
        toggleSeason.mutate({
          seriesId,
          seasonNumber: season.seasonNumber,
          monitored: !season.monitored,
        }),
    },
    ...(onSearchMissingSubtitles
      ? [
          {
            label: "Search missing subtitles",
            subtitle:
              subtitleGaps > 0
                ? `${subtitleGaps} episode${subtitleGaps === 1 ? "" : "s"} missing a language`
                : "Nothing missing",
            icon: <Icon icon={Captions} size={20} color="#a1a1aa" />,
            disabled: subtitleGaps === 0,
            onPress: onSearchMissingSubtitles,
          },
        ]
      : []),
    ...(seasonFileIds.length > 0
      ? [
          {
            label: "Delete Files",
            subtitle: `${seasonFileIds.length} file${
              seasonFileIds.length !== 1 ? "s" : ""
            }${stats?.sizeOnDisk ? ` · ${formatBytes(stats.sizeOnDisk)}` : ""}`,
            icon: <Icon icon={Trash2} size={20} color="#ef4444" />,
            variant: "danger" as const,
            onPress: () => flow.open("confirmDeleteFiles"),
          },
        ]
      : []),
  ];

  return (
    <>
      <CollapsibleCard
        title={seasonLabel}
        expanded={expanded}
        onToggle={setExpanded}
        right={
          <View className="flex-row items-center gap-3">
            {subtitleGaps > 0 ? (
              <View
                className="flex-row items-center gap-1"
                accessible
                accessibilityLabel={`${subtitleGaps} episode${subtitleGaps === 1 ? "" : "s"} missing subtitles`}
              >
                <Icon icon={Captions} size={13} color="#fb923c" />
                <Text className="text-orange-400 text-xs font-bold">
                  {subtitleGaps}
                </Text>
              </View>
            ) : null}
            {stats && (
              <Text className="text-zinc-500 text-xs">
                {stats.episodeFileCount}/{stats.episodeCount}
              </Text>
            )}
            <View className="flex-row items-center gap-1">
              {/* Mirrors the per-episode bookmark: without it the menu's
                Monitor/Unmonitor row would be the only way to see — or notice a
                change in — the season's monitored state. */}
              <Pressable
                onPress={() =>
                  toggleSeason.mutate({
                    seriesId,
                    seasonNumber: season.seasonNumber,
                    monitored: !season.monitored,
                  })
                }
                disabled={toggleSeason.isPending}
                hitSlop={8}
                className={`p-1 active:opacity-70 ${
                  toggleSeason.isPending ? "opacity-50" : ""
                }`}
                accessibilityRole="button"
                accessibilityLabel={
                  season.monitored
                    ? `${seasonLabel} monitored — tap to unmonitor`
                    : `${seasonLabel} not monitored — tap to monitor`
                }
              >
                <Icon
                  icon={Bookmark}
                  size={16}
                  color={season.monitored ? "#3b82f6" : "#52525b"}
                  fill={season.monitored ? "#3b82f6" : "transparent"}
                />
              </Pressable>
              <Pressable
                onPress={() => flow.open("menu")}
                hitSlop={8}
                className="p-1 active:opacity-70"
                accessibilityRole="button"
                accessibilityLabel={`${seasonLabel} actions`}
              >
                <Icon icon={MoreHorizontal} size={16} color="#a1a1aa" />
              </Pressable>
            </View>
          </View>
        }
        summary={
          stats ? (
            <ProgressBar
              progress={progress}
              fillColor={seasonDownloading ? BAR_KIND_COLOR.purple : undefined}
              className="mt-2"
            />
          ) : null
        }
      >
        {expanded && episodes && (
          <View className="mt-3 gap-1">
            {episodes
              // Descending (latest episode first) to match Sonarr's web UI.
              .sort((a, b) => b.episodeNumber - a.episodeNumber)
              .map((ep) => (
                <EpisodeRow
                  key={ep.id}
                  seriesId={seriesId}
                  instanceId={instanceId}
                  episode={ep}
                  episodeFile={
                    ep.episodeFileId
                      ? episodeFileMap.get(ep.episodeFileId)
                      : undefined
                  }
                  isDownloading={downloadingEpisodeIds.has(ep.id)}
                  languages={episodeLanguages?.get(ep.id)}
                  onOpenSubtitles={
                    // Only episodes Bazarr lists have a sheet to open.
                    onOpenSubtitles && episodeLanguages?.get(ep.id)?.chips
                      ? () => onOpenSubtitles(ep.id)
                      : undefined
                  }
                />
              ))}
          </View>
        )}
      </CollapsibleCard>

      <ActionSheet
        {...flow.bind("menu")}
        title={seasonLabel}
        actions={seasonActions}
      />

      <ConfirmModal
        {...flow.bind("confirmDeleteFiles")}
        title="Delete Season Files"
        message={`Delete ${seasonFileIds.length} episode file${
          seasonFileIds.length !== 1 ? "s" : ""
        } for ${seasonLabel}? The episodes stay in the library but will be marked missing.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          flow.close();
          if (seasonFileIds.length > 0) deleteSeasonFiles.mutate(seasonFileIds);
        }}
      />
    </>
  );
}
