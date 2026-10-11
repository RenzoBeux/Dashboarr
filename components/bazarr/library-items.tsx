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
import { useServiceImage } from "@/hooks/use-service-image";
import { useThemeColor } from "@/hooks/use-theme-color";
import { BASE_REM, useUiScale } from "@/hooks/use-ui-scale";
import { useBazarrSeriesEpisodes } from "@/hooks/use-bazarr-subtitles";
import {
  buildAudioTags,
  buildSubtitleChips,
  buildSubtitleRows,
} from "@/lib/subtitle-model";
import {
  classifyMovie,
  classifySeries,
  seriesCoverage,
  seriesSubtitledCount,
} from "@/lib/bazarr-library";
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
  // No image without a linked instance: useServiceImage would otherwise fall
  // back to the active instance's server.
  const poster = arrInstanceId
    ? lookup?.images?.find((i) => i.coverType === "poster")
    : undefined;
  return useServiceImage(poster, kind, arrInstanceId ?? undefined);
}

// The cell's Pressable carries the label, which replaces what its children
// would read, so the subtitle state goes into it.
function movieA11yLabel(movie: BazarrMovie): string {
  const state = classifyMovie(movie);
  return [
    movie.title,
    movie.year,
    state === "noprofile"
      ? "No language profile"
      : state === "missing"
        ? `Missing ${movie.missing_subtitles.map((m) => m.name).join(", ")} subtitles`
        : "All profile languages present",
  ]
    .filter(Boolean)
    .join(", ");
}

function seriesA11yLabel(series: BazarrSeries): string {
  const state = classifySeries(series);
  const done = seriesSubtitledCount(series);
  return [
    series.title,
    series.year,
    state === "noprofile"
      ? "No language profile"
      : series.episodeFileCount <= 0
        ? "No episode files"
        : `${done} of ${series.episodeFileCount} episodes subtitled`,
    state === "missing"
      ? `${series.episodeMissingCount} ${series.episodeMissingCount === 1 ? "episode" : "episodes"} missing subtitles`
      : null,
  ]
    .filter(Boolean)
    .join(", ");
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
        accessibilityLabel={movieA11yLabel(movie)}
      >
        <Thumb src={src} onError={onError} fallback={Film} />
        <View className="flex-1 min-w-0">
          <Text
            className={`text-zinc-100 text-sm font-semibold ${showSearch ? "pr-9" : ""}`}
            numberOfLines={1}
          >
            {movie.title}
          </Text>
          {movie.year || noProfile ? (
            <Text className="text-zinc-500 text-xs mt-0.5">
              {[movie.year, noProfile ? "No language profile" : null].filter(Boolean).join(" · ")}
            </Text>
          ) : null}
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
  const uiScale = useUiScale();
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
      onPress={onPress}
      accessibilityLabel={movieA11yLabel(movie)}
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
              // The cell minus the overlay's px-1.5: known, so not measured.
              width={width - 2 * 0.375 * BASE_REM * uiScale}
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
  const done = seriesSubtitledCount(series);
  const noFiles = series.episodeFileCount <= 0;
  // Nothing to measure: no profile wants anything, or no episode is on disk.
  const showProgress = state !== "noprofile" && !noFiles;
  const canExpand = expandable && series.episodeMissingCount > 0;
  // A filter change or the last missing episode getting fixed removes the
  // toggle: collapse, so the list neither strands nor reopens by itself.
  if (open && !canExpand) setOpen(false);

  return (
    <View className="mb-2 rounded-2xl bg-surface border border-border overflow-hidden">
      <View className="flex-row items-center">
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          className="flex-1 flex-row gap-3 p-2.5 active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={seriesA11yLabel(series)}
        >
          <Thumb src={src} onError={onError} fallback={Tv} />
          <View className="flex-1 min-w-0 justify-center">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="flex-1 text-zinc-100 text-sm font-semibold" numberOfLines={1}>
                {series.title}
              </Text>
              {state === "missing" ? (
                // Announced through the row's label (seriesA11yLabel).
                <View className="flex-row items-center gap-1">
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
              {[
                series.year,
                state === "noprofile" ? "No language profile" : noFiles ? "No episode files" : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            {showProgress ? (
              <View className="flex-row items-center gap-2 mt-2">
                <View className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                  <View className="h-full bg-primary" style={{ width: `${Math.round(pct * 100)}%` }} />
                </View>
                <Text className="text-zinc-400 text-xs">
                  {done}/{series.episodeFileCount}
                </Text>
              </View>
            ) : null}
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
  // Without a series page to send the rest to (no linked Sonarr), the list
  // grows in place: every missing episode stays searchable.
  const [showAll, setShowAll] = useState(false);
  // Loaded only once the row is expanded.
  const { data, error } = useBazarrSeriesEpisodes(bazarrId, seriesId);
  const missing = (data ?? [])
    .filter((e) => e.missing_subtitles.length > 0)
    .sort((a, b) => b.season - a.season || b.episode - a.episode);

  // Pending, not isLoading: a fetch paused offline isn't "loading" and must
  // not read as "nothing missing".
  if (!data && !error) {
    return (
      <View className="py-3 items-center border-t border-zinc-800">
        <ActivityIndicator size="small" color={tc("#a1a1aa")} />
      </View>
    );
  }
  // The series' missing count can be ahead of its episodes; say so rather
  // than expanding to nothing. Only a failed first load is an error: a failed
  // background refetch keeps the episodes already loaded.
  if (!data || missing.length === 0) {
    return (
      <Text className="px-3.5 py-2.5 border-t border-zinc-800 text-zinc-500 text-xs">
        {!data ? "Couldn't load the episodes" : "No episodes are missing subtitles"}
      </Text>
    );
  }
  return (
    <View>
      {(showAll ? missing : missing.slice(0, MISSING_PREVIEW)).map((e) => (
        <View
          key={e.sonarrEpisodeId}
          className="flex-row items-center gap-2.5 px-3.5 py-2 border-t border-zinc-800"
        >
          {/* Chips on their own line: it fits as many as the row allows,
              then "+N", without squeezing the title. */}
          <View className="flex-1 min-w-0">
            <Text className="text-zinc-300 text-xs" numberOfLines={1}>
              {formatEpisodeCode(e.season, e.episode)} — {e.title}
            </Text>
            <LanguageLines
              subtitles={buildSubtitleChips(
                buildSubtitleRows({ missing_subtitles: e.missing_subtitles }),
              )}
            />
          </View>
          <SearchIconButton
            label={`Search subtitles for ${formatEpisodeCode(e.season, e.episode)}`}
            busy={searching.has(e.sonarrEpisodeId)}
            onPress={() => onSearch(e)}
          />
        </View>
      ))}
      {missing.length > MISSING_PREVIEW && !showAll ? (
        <Pressable
          onPress={onShowAll ?? (() => setShowAll(true))}
          className="px-3.5 py-2.5 border-t border-zinc-800 active:opacity-70"
          accessibilityRole="button"
        >
          <Text className="text-primary text-xs font-semibold">
            {onShowAll
              ? `All ${missing.length} episodes on the series page`
              : `Show all ${missing.length} episodes`}
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
  const done = seriesSubtitledCount(series);
  const state = classifySeries(series);
  const noFiles = series.episodeFileCount <= 0;
  const complete = state === "complete";
  return (
    <LibraryPosterTile
      width={width}
      src={src}
      onImageError={onError}
      placeholderIcon={Tv}
      title={series.title}
      footer={series.year}
      onPress={onPress}
      accessibilityLabel={seriesA11yLabel(series)}
      overlay={
        <>
          {complete ? <DoneBadge label="All episodes subtitled" /> : null}
          {state === "noprofile" || noFiles ? null : (
            <View
              className="absolute bottom-0 left-0 right-0 bg-background/85 flex-row items-center gap-1.5 px-1.5 py-1.5"
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
          )}
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
