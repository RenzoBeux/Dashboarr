import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { ChevronRight, Search } from "lucide-react-native";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import type {
  CoverageCell,
  CoverageLanguage,
  CoverageSeason,
} from "@/lib/subtitle-model";

/**
 * The series page's Subtitles section: per-language progress across the
 * whole series when collapsed; expanded, a language × episode grid per season
 * where every cell opens that episode's subtitles, a Search for the season's
 * gaps, and the series' language profile.
 */
export function SubtitleCoverageCard({
  languages,
  seasons,
  onOpenEpisode,
  onSearchSeason,
  profileName,
  onPressProfile,
}: {
  languages: readonly CoverageLanguage[];
  // Newest first, as buildCoverageGrid returns them.
  seasons: readonly CoverageSeason[];
  onOpenEpisode: (episodeId: number) => void;
  onSearchSeason: (season: number) => void;
  profileName: string | null;
  onPressProfile?: () => void;
}) {
  const [seasonNumber, setSeasonNumber] = useState<number | null>(null);
  // Default to the newest season with gaps, else the newest.
  useEffect(() => {
    if (seasonNumber !== null && seasons.some((s) => s.season === seasonNumber)) return;
    setSeasonNumber((seasons.find((s) => s.gaps > 0) ?? seasons[0])?.season ?? null);
  }, [seasons, seasonNumber]);

  const totals = useMemo(
    () =>
      languages.map((lang, i) => {
        let done = 0;
        let total = 0;
        for (const s of seasons) {
          for (const ep of s.episodes) {
            const cell = ep.cells[i];
            if (cell === "unwanted") continue;
            total += 1;
            if (cell !== "missing") done += 1;
          }
        }
        return { lang, done, total };
      }),
    [languages, seasons],
  );

  const season = seasons.find((s) => s.season === seasonNumber) ?? null;

  return (
    <CollapsibleCard
      accessibilityLabel="Subtitle coverage"
      title={
        <View className="flex-1 flex-row flex-wrap gap-x-3 gap-y-2">
          {totals.map(({ lang, done, total }) => (
            <View key={lang.key} className="flex-row items-center gap-1.5">
              <SubtitleTrackChip
                code={lang.code2}
                state="present"
                forced={lang.forced}
                hi={lang.hi}
                size="sm"
              />
              <View className="w-8 h-1 rounded-full bg-zinc-800 overflow-hidden">
                <View
                  className="h-full bg-primary"
                  style={{ width: `${total > 0 ? Math.round((done / total) * 100) : 0}%` }}
                />
              </View>
              <Text className="text-zinc-400 text-xs">
                {done}/{total}
              </Text>
            </View>
          ))}
        </View>
      }
    >
      <View className="-mx-4 -mb-4 mt-3 border-t border-zinc-800">
        {seasons.length > 1 ? (
          <View className="px-3 pt-3">
            <SegmentedControl
              options={seasons.map((s) => ({
                value: String(s.season),
                label: s.season === 0 ? "Specials" : `S${s.season}`,
              }))}
              value={String(seasonNumber)}
              onChange={(v) => setSeasonNumber(Number(v))}
            />
          </View>
        ) : null}

        {season ? <SeasonGrid season={season} languages={languages} onOpenEpisode={onOpenEpisode} /> : null}

        <View className="flex-row px-3 py-2.5 border-t border-zinc-800">
          <Pressable
            onPress={() => season && onSearchSeason(season.season)}
            disabled={!season || season.gaps === 0}
            className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-surface-light py-2 ${
              !season || season.gaps === 0 ? "opacity-50" : "active:opacity-70"
            }`}
            accessibilityRole="button"
          >
            <Icon icon={Search} size={14} color="#d4d4d8" />
            <Text className="text-zinc-200 text-xs font-semibold">
              {season && season.gaps > 0
                ? `Search ${season.gaps} episode${season.gaps === 1 ? "" : "s"}`
                : "Nothing missing"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          onPress={onPressProfile}
          disabled={!onPressProfile}
          className="flex-row items-center justify-between px-4 py-3 border-t border-zinc-800 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={`Language profile: ${profileName ?? "none"}`}
        >
          <Text className="text-zinc-500 text-xs">Language profile</Text>
          <View className="flex-row items-center gap-1">
            <Text className="text-zinc-200 text-xs">{profileName ?? "None"}</Text>
            {onPressProfile ? <Icon icon={ChevronRight} size={14} color="#71717a" /> : null}
          </View>
        </Pressable>
      </View>
    </CollapsibleCard>
  );
}

const CELL = "w-[1.15rem] h-[1.15rem] rounded-[0.25rem]";

function SeasonGrid({
  season,
  languages,
  onOpenEpisode,
}: {
  season: CoverageSeason;
  languages: readonly CoverageLanguage[];
  onOpenEpisode: (episodeId: number) => void;
}) {
  if (season.episodes.length === 0) {
    return (
      <Text className="text-zinc-500 text-xs px-4 py-3">
        No downloaded episodes in this season.
      </Text>
    );
  }
  return (
    <View className="flex-row px-3 pt-3 pb-3">
      {/* Language column stays put while the episode cells scroll. */}
      <View className="gap-1.5 mr-1.5">
        <View className="h-[1rem]" />
        {languages.map((lang) => (
          <View key={lang.key} className="h-[1.15rem] justify-center pr-1 pt-0.5">
            <SubtitleTrackChip
              code={lang.code2}
              state="present"
              forced={lang.forced}
              hi={lang.hi}
              size="xs"
            />
          </View>
        ))}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="gap-1.5">
          <View className="flex-row gap-1">
            {season.episodes.map((ep) => (
              <Text key={ep.episodeId} className="w-[1.15rem] h-[1rem] text-center text-zinc-500 text-[0.6rem]">
                {ep.episode}
              </Text>
            ))}
          </View>
          {languages.map((lang, li) => (
            <View key={lang.key} className="flex-row gap-1">
              {season.episodes.map((ep) => (
                <Cell
                  key={ep.episodeId}
                  cell={ep.cells[li]}
                  label={`Episode ${ep.episode}, ${lang.code2.toUpperCase()}: ${CELL_LABEL[ep.cells[li]]}`}
                  onPress={() => onOpenEpisode(ep.episodeId)}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_LABEL: Record<CoverageCell, string> = {
  present: "subtitle file",
  embedded: "embedded track",
  missing: "missing",
  unwanted: "not wanted",
};

function Cell({
  cell,
  label,
  onPress,
}: {
  cell: CoverageCell;
  label: string;
  onPress: () => void;
}) {
  if (cell === "unwanted") {
    return (
      <View className={`${CELL} items-center justify-center`} accessible accessibilityLabel={label}>
        <View className="w-1 h-1 rounded-full bg-zinc-700" />
      </View>
    );
  }
  const style =
    cell === "present"
      ? "bg-primary"
      : cell === "embedded"
        ? "bg-zinc-600"
        : "border-[0.1rem] border-dashed border-orange-400";
  return (
    <Pressable
      onPress={onPress}
      hitSlop={2}
      className={`${CELL} ${style} active:opacity-60`}
      accessibilityRole="button"
      accessibilityLabel={label}
    />
  );
}
