import { useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import {
  Captions,
  Check,
  ChevronDown,
  ChevronUp,
  Film,
  Search,
  Tv,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { LibraryPosterTile } from "@/components/common/library-collection";
import { LanguageLines } from "@/components/subtitles/language-lines";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { useServiceImage } from "@/hooks/use-service-image";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useBazarrSeriesEpisodes } from "@/hooks/use-bazarr-subtitles";
import {
  buildAudioTags,
  buildSubtitleChips,
  buildSubtitleRows,
} from "@/lib/subtitle-model";
import { classifyMovie, classifySeries, seriesCoverage } from "@/lib/bazarr-library";
import { formatEpisodeCode } from "@/lib/utils";
import type {
  ArrLanguage,
  BazarrEpisode,
  BazarrMovie,
  BazarrSeries,
  RadarrImage,
  SonarrImage,
} from "@/lib/types";

/**
 * Rows and poster cells of the Bazarr library. Artwork and the original
 * language come from the Radarr/Sonarr the Bazarr instance is linked to (its
 * ids only mean something there); without a link the cells show a placeholder.
 */

export interface ArrLookup {
  images?: (RadarrImage | SonarrImage)[];
  originalLanguage?: ArrLanguage;
}

function usePoster(kind: "radarr" | "sonarr", arrInstanceId: string | null, lookup?: ArrLookup) {
  const poster = lookup?.images?.find((i) => i.coverType === "poster");
  return useServiceImage(poster, kind, arrInstanceId ?? undefined);
}

// --- Movies ---

export function BazarrMovieRow({
  movie,
  lookup,
  arrInstanceId,
  showSearch,
  searching,
  onSearch,
  onPress,
}: {
  movie: BazarrMovie;
  lookup?: ArrLookup;
  arrInstanceId: string | null;
  // Missing filter: a search button for this movie's missing languages.
  showSearch: boolean;
  searching: boolean;
  onSearch: () => void;
  onPress?: () => void;
}) {
  const { src, onError } = usePoster("radarr", arrInstanceId, lookup);
  const chips = buildSubtitleChips(buildSubtitleRows(movie));
  const audio = buildAudioTags(movie.audio_language, lookup?.originalLanguage);
  const noProfile = classifyMovie(movie) === "noprofile";

  return (
    <View className="mb-2">
      <Pressable
        onPress={onPress}
        disabled={!onPress}
        className="flex-row gap-3 rounded-2xl bg-surface border border-border p-2.5 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel={`${movie.title}${movie.year ? ` (${movie.year})` : ""}`}
      >
        <Thumb src={src} onError={onError} fallback={Film} />
        <View className="flex-1 min-w-0">
          <Text
            className={`text-zinc-100 text-sm font-semibold ${showSearch ? "pr-9" : ""}`}
            numberOfLines={1}
          >
            {movie.title}
          </Text>
          <Text className="text-zinc-500 text-xs mt-0.5">
            {movie.year ?? ""}
            {noProfile ? `${movie.year ? " · " : ""}No language profile` : ""}
          </Text>
          <View className="mt-1">
            <LanguageLines audio={audio} subtitles={chips} />
          </View>
        </View>
      </Pressable>
      {showSearch ? (
        <SearchIconButton
          className="absolute top-2 right-2"
          label={`Search missing subtitles for ${movie.title}`}
          busy={searching}
          onPress={onSearch}
        />
      ) : null}
    </View>
  );
}

export function BazarrMoviePoster({
  movie,
  lookup,
  arrInstanceId,
  width,
  onPress,
}: {
  movie: BazarrMovie;
  lookup?: ArrLookup;
  arrInstanceId: string | null;
  width: number;
  onPress?: () => void;
}) {
  const { src, onError } = usePoster("radarr", arrInstanceId, lookup);
  const chips = buildSubtitleChips(buildSubtitleRows(movie));
  const audio = buildAudioTags(movie.audio_language, lookup?.originalLanguage);
  const complete = classifyMovie(movie) === "complete";
  return (
    <LibraryPosterTile
      width={width}
      src={src}
      onImageError={onError}
      placeholderIcon={Film}
      title={movie.title}
      footer={movie.year}
      onPress={onPress ?? (() => {})}
      overlay={
        <>
          {complete ? <DoneBadge label="All profile languages present" /> : null}
          {/* Theme scrim, not black: the tags keep their themed colors. */}
          <View className="absolute bottom-0 left-0 right-0 bg-background/85 px-1.5 pb-1.5">
            <LanguageLines
              audio={audio}
              subtitles={chips}
              size="xs"
              stacked
              ringClassName="border-background"
            />
          </View>
        </>
      }
    />
  );
}

// --- Series ---

export function BazarrSeriesRow({
  series,
  lookup,
  arrInstanceId,
  bazarrId,
  expandable,
  searchingEpisodes,
  onSearchEpisode,
  onPress,
}: {
  series: BazarrSeries;
  lookup?: ArrLookup;
  arrInstanceId: string | null;
  bazarrId: string;
  // Missing filter: the row expands to the episodes missing a language.
  expandable: boolean;
  searchingEpisodes: ReadonlySet<number>;
  onSearchEpisode: (episode: BazarrEpisode) => void;
  onPress?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { src, onError } = usePoster("sonarr", arrInstanceId, lookup);
  const state = classifySeries(series);
  const pct = seriesCoverage(series);
  const done = Math.max(0, series.episodeFileCount - series.episodeMissingCount);
  const canExpand = expandable && series.episodeMissingCount > 0;

  return (
    <View className="mb-2 rounded-2xl bg-surface border border-border overflow-hidden">
      <View className="flex-row items-center">
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          className="flex-1 flex-row gap-3 p-2.5 active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={series.title}
        >
          <Thumb src={src} onError={onError} fallback={Tv} />
          <View className="flex-1 min-w-0 justify-center">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-zinc-100 text-sm font-semibold" numberOfLines={1}>
                {series.title}
              </Text>
              {state === "missing" ? (
                <View
                  className="flex-row items-center gap-1"
                  accessible
                  accessibilityLabel={`${series.episodeMissingCount} episodes missing subtitles`}
                >
                  <Icon icon={Captions} size={13} color="#fb923c" />
                  <Text className="text-orange-400 text-xs font-bold">
                    {series.episodeMissingCount}
                  </Text>
                </View>
              ) : state === "complete" ? (
                <Icon icon={Check} size={14} color="#60a5fa" />
              ) : null}
            </View>
            <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
              {[series.year, state === "noprofile" ? "No language profile" : null]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <View className="flex-row items-center gap-2 mt-2">
              <View className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <View className="h-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
              </View>
              <Text className="text-zinc-400 text-xs">
                {done}/{series.episodeFileCount}
              </Text>
            </View>
          </View>
        </Pressable>
        {canExpand ? (
          <Pressable
            onPress={() => setOpen((o) => !o)}
            hitSlop={6}
            className="w-8 h-8 mr-2.5 rounded-lg bg-surface-light items-center justify-center active:opacity-70"
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            accessibilityLabel={open ? "Hide missing episodes" : "Show missing episodes"}
          >
            <Icon icon={open ? ChevronUp : ChevronDown} size={16} color="#d4d4d8" />
          </Pressable>
        ) : null}
      </View>
      {open ? (
        <MissingEpisodes
          bazarrId={bazarrId}
          seriesId={series.sonarrSeriesId}
          searching={searchingEpisodes}
          onSearch={onSearchEpisode}
          onShowAll={onPress}
        />
      ) : null}
    </View>
  );
}

const MISSING_PREVIEW = 5;

function MissingEpisodes({
  bazarrId,
  seriesId,
  searching,
  onSearch,
  onShowAll,
}: {
  bazarrId: string;
  seriesId: number;
  searching: ReadonlySet<number>;
  onSearch: (episode: BazarrEpisode) => void;
  onShowAll?: () => void;
}) {
  const tc = useThemeColor();
  // Loaded only once the row is expanded.
  const { data, isLoading } = useBazarrSeriesEpisodes(bazarrId, seriesId);
  const missing = (data ?? [])
    .filter((e) => e.missing_subtitles.length > 0)
    .sort((a, b) => b.season - a.season || b.episode - a.episode);

  if (isLoading) {
    return (
      <View className="py-3 items-center border-t border-zinc-800">
        <ActivityIndicator size="small" color={tc("#a1a1aa")} />
      </View>
    );
  }
  return (
    <View>
      {missing.slice(0, MISSING_PREVIEW).map((e) => (
        <View
          key={e.sonarrEpisodeId}
          className="flex-row items-center gap-2.5 px-3.5 py-2 border-t border-zinc-800"
        >
          <Text className="flex-1 text-zinc-300 text-xs" numberOfLines={1}>
            {formatEpisodeCode(e.season, e.episode)} — {e.title}
          </Text>
          <View className="flex-row gap-2 pt-1">
            {e.missing_subtitles.slice(0, 3).map((m) => (
              <SubtitleTrackChip
                key={`${m.code2}${m.forced ? "f" : ""}${m.hi ? "h" : ""}`}
                code={m.code2}
                name={m.name}
                state="missing"
                forced={m.forced}
                hi={m.hi}
                size="sm"
              />
            ))}
          </View>
          <SearchIconButton
            label={`Search subtitles for ${formatEpisodeCode(e.season, e.episode)}`}
            busy={searching.has(e.sonarrEpisodeId)}
            onPress={() => onSearch(e)}
          />
        </View>
      ))}
      {missing.length > MISSING_PREVIEW && onShowAll ? (
        <Pressable
          onPress={onShowAll}
          className="px-3.5 py-2.5 border-t border-zinc-800 active:opacity-70"
          accessibilityRole="button"
        >
          <Text className="text-primary text-xs font-semibold">
            All {missing.length} episodes on the series page
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BazarrSeriesPoster({
  series,
  lookup,
  arrInstanceId,
  width,
  onPress,
}: {
  series: BazarrSeries;
  lookup?: ArrLookup;
  arrInstanceId: string | null;
  width: number;
  onPress?: () => void;
}) {
  const { src, onError } = usePoster("sonarr", arrInstanceId, lookup);
  const pct = seriesCoverage(series);
  const done = Math.max(0, series.episodeFileCount - series.episodeMissingCount);
  const complete = classifySeries(series) === "complete";
  return (
    <LibraryPosterTile
      width={width}
      src={src}
      onImageError={onError}
      placeholderIcon={Tv}
      title={series.title}
      footer={series.year}
      onPress={onPress ?? (() => {})}
      overlay={
        <>
          {complete ? <DoneBadge label="All episodes subtitled" /> : null}
          <View
            className="absolute bottom-0 left-0 right-0 bg-background/85 flex-row items-center gap-1.5 px-1.5 py-1.5"
            accessible
            accessibilityLabel={`${done} of ${series.episodeFileCount} episodes subtitled`}
          >
            <Icon icon={Captions} size={10} color="#a1a1aa" />
            <View className="flex-1 h-1 rounded-full bg-zinc-700 overflow-hidden">
              <View className="h-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
            </View>
            <Text
              className={`text-[0.55rem] font-extrabold ${
                complete ? "text-primary" : series.episodeMissingCount > 0 ? "text-orange-400" : "text-zinc-400"
              }`}
            >
              {done}/{series.episodeFileCount}
            </Text>
          </View>
        </>
      }
    />
  );
}

// --- Shared bits ---

function Thumb({
  src,
  onError,
  fallback,
}: {
  src?: string;
  onError?: (e?: { error?: string }) => void;
  fallback: React.ComponentType<any>;
}) {
  return (
    <View className="w-11 h-16 rounded-lg overflow-hidden bg-surface-light items-center justify-center">
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full h-full"
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={src}
          onError={onError}
        />
      ) : (
        <Icon icon={fallback} size={18} color="#71717a" />
      )}
    </View>
  );
}

function DoneBadge({ label }: { label: string }) {
  return (
    <View
      className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-primary items-center justify-center"
      accessible
      accessibilityLabel={label}
    >
      <Icon icon={Check} size={12} color="#fff" themed={false} />
    </View>
  );
}

function SearchIconButton({
  label,
  busy,
  onPress,
  className = "",
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
  className?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      hitSlop={6}
      className={`w-8 h-8 rounded-lg bg-primary items-center justify-center ${
        busy ? "opacity-60" : "active:opacity-80"
      } ${className}`}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {busy ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Icon icon={Search} size={14} color="#fff" themed={false} />
      )}
    </Pressable>
  );
}
