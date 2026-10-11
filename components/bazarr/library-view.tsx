import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  ActivityIndicator,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import { Captions, Search } from "lucide-react-native";
import { LibraryCollection } from "@/components/common/library-collection";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast, toastError } from "@/components/ui/toast";
import { CoverageBars } from "@/components/bazarr/coverage-bars";
import {
  BazarrMoviePoster,
  BazarrMovieRow,
  BazarrSeriesPoster,
  BazarrSeriesRow,
  type ArrLookup,
} from "@/components/bazarr/library-items";
import { useLinkedArrInstance } from "@/hooks/use-bazarr-link";
import {
  useBazarrMovieLibrary,
  useBazarrSeriesLibrary,
} from "@/hooks/use-bazarr-library";
import {
  useBazarrLanguageProfiles,
  useBazarrSubtitleMutation,
  useBazarrJobsActive,
} from "@/hooks/use-bazarr-subtitles";
import { useRadarrMovies } from "@/hooks/use-radarr";
import { useSonarrSeries } from "@/hooks/use-sonarr";
import {
  searchAllWanted,
  searchMissingSubtitles,
  searchSubtitles,
} from "@/services/bazarr-api";
import {
  classifyMovie,
  classifySeries,
  computeLanguageCoverage,
  filterCounts,
  filterMovies,
  profileLanguageMap,
  type LanguageFilter,
  filterSeries,
  type LibraryFilter,
} from "@/lib/bazarr-library";
import { buildLibraryIndex, filterLibraryIndex } from "@/lib/library-search";
import { lightHaptic } from "@/lib/haptics";
import { useThemeColor } from "@/hooks/use-theme-color";
import type { LibraryViewMode } from "@/store/library-view-store";
import type { BazarrEpisode, BazarrMovie, BazarrSeries } from "@/lib/types";

export type BazarrLibraryKind = "movies" | "series";

const FILTER_LABEL: Record<LibraryFilter, string> = {
  all: "All",
  missing: "Missing",
  complete: "Complete",
  noprofile: "No profile",
};
const FILTERS: LibraryFilter[] = ["all", "missing", "complete", "noprofile"];

/**
 * The Bazarr tab's Library: every movie or series Bazarr manages with its
 * audio and subtitle languages — not just the ones missing something. The
 * Missing filter takes over the old Wanted lists: it adds "Search all
 * missing", a search button per movie, and series rows that expand to their
 * missing episodes.
 */
export function BazarrLibraryView({
  bazarrId,
  kind,
  onKindChange,
  filter,
  onFilterChange: setFilter,
  mode,
  query,
  onClearSearch,
  resetFilters,
  header,
  refreshControl,
  contentContainerStyle,
}: {
  bazarrId: string;
  kind: BazarrLibraryKind;
  onKindChange: (kind: BazarrLibraryKind) => void;
  // Lifted so other screens can open the tab on a filter (the dashboard's
  // Wanted card opens Missing).
  filter: LibraryFilter;
  onFilterChange: (filter: LibraryFilter) => void;
  mode: LibraryViewMode;
  // Debounced in-list search.
  query: string;
  onClearSearch: () => void;
  // Changes when a link opens the tab: drop the language filter. A remount
  // would also drop rows still searching.
  resetFilters: number;
  header: React.ReactElement;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const tc = useThemeColor();
  const [langFilter, setLangFilter] = useState<LanguageFilter | null>(null);
  const [seenReset, setSeenReset] = useState(resetFilters);
  if (resetFilters !== seenReset) {
    setSeenReset(resetFilters);
    setLangFilter(null);
  }

  const moviesQuery = useBazarrMovieLibrary(bazarrId, kind === "movies");
  const seriesQuery = useBazarrSeriesLibrary(bazarrId, kind === "series");
  const { data: profiles } = useBazarrLanguageProfiles(bazarrId);

  // Artwork, original language and "open" come from the linked arr.
  const radarrId = useLinkedArrInstance(bazarrId, "radarr");
  const sonarrId = useLinkedArrInstance(bazarrId, "sonarr");
  const { data: radarrMovies } = useRadarrMovies(
    radarrId ?? undefined,
    !!radarrId && kind === "movies",
  );
  const { data: sonarrSeries } = useSonarrSeries(
    sonarrId ?? undefined,
    !!sonarrId && kind === "series",
  );
  // Unlinked: no lookup at all. A disabled query can still hand back the
  // active instance's cached library, whose ids mean something else.
  const movieLookup = useMemo(
    () =>
      new Map<number, ArrLookup>(
        (radarrId ? (radarrMovies ?? []) : []).map((m) => [m.id, m]),
      ),
    [radarrId, radarrMovies],
  );
  const seriesLookup = useMemo(
    () =>
      new Map<number, ArrLookup>(
        (sonarrId ? (sonarrSeries ?? []) : []).map((s) => [s.id, s]),
      ),
    [sonarrId, sonarrSeries],
  );

  // Rows whose search the user started, until Bazarr's queue drains.
  const jobsActive = useBazarrJobsActive(bazarrId);
  const [busyMovies, setBusyMovies] = useState<ReadonlySet<number>>(new Set());
  const [busyEpisodes, setBusyEpisodes] = useState<ReadonlySet<number>>(
    new Set(),
  );
  // Requests not answered yet: their jobs aren't tracked, so another
  // search's queue draining must not clear them.
  const inFlightMovies = useRef(new Set<number>());
  const inFlightEpisodes = useRef(new Set<number>());
  // "Search all" answers at once on Bazarr 1.5.6+ while the searches queue;
  // held until the queue drains so a second tap doesn't queue them again.
  const [searchingAll, setSearchingAll] = useState<ReadonlySet<BazarrLibraryKind>>(new Set());
  const [wasActive, setWasActive] = useState(false);
  if (jobsActive !== wasActive) {
    setWasActive(jobsActive);
    if (!jobsActive) {
      setBusyMovies(new Set(inFlightMovies.current));
      setBusyEpisodes(new Set(inFlightEpisodes.current));
      setSearchingAll(new Set());
    }
  }

  const searchMovie = useBazarrSubtitleMutation(
    bazarrId,
    (radarrMovieId: number, id) =>
      searchMissingSubtitles({ type: "movie", radarrId: radarrMovieId }, id),
    (radarrMovieId) => ({ type: "movie", radarrId: radarrMovieId }),
  );
  const searchEpisode = useBazarrSubtitleMutation(
    bazarrId,
    (e: BazarrEpisode, id) =>
      searchSubtitles(
        e.missing_subtitles.map((m) => ({
          target: {
            type: "episode" as const,
            seriesId: e.sonarrSeriesId,
            episodeId: e.sonarrEpisodeId,
          },
          lang: { code2: m.code2, forced: m.forced, hi: m.hi },
        })),
        id,
      ),
    (e) => ({
      type: "episode",
      seriesId: e.sonarrSeriesId,
      episodeId: e.sonarrEpisodeId,
    }),
  );
  const searchAll = useBazarrSubtitleMutation(
    bazarrId,
    (k: BazarrLibraryKind, id) => searchAllWanted(k, id),
    () => null,
  );

  // --- Movies ---
  const movies = moviesQuery.data ?? [];
  const movieCounts = useMemo(
    () => filterCounts(movies, classifyMovie),
    [movies],
  );
  const profileLangs = useMemo(
    () => profileLanguageMap(profiles ?? []),
    [profiles],
  );
  const coverage = useMemo(
    () => computeLanguageCoverage(movies, profileLangs),
    [movies, profileLangs],
  );
  const movieIndex = useMemo(
    () =>
      buildLibraryIndex(movies, (m) => ({
        title: m.title,
        year: m.year ? Number(m.year) : undefined,
      })),
    [movies],
  );
  const shownMovies = useMemo(
    () =>
      filterMovies(
        filterLibraryIndex(movieIndex, query),
        filter,
        langFilter,
        profileLangs,
      ),
    [movieIndex, query, filter, langFilter, profileLangs],
  );

  // --- Series ---
  const series = seriesQuery.data ?? [];
  const seriesCounts = useMemo(
    () => filterCounts(series, classifySeries),
    [series],
  );
  const seriesIndex = useMemo(
    () =>
      buildLibraryIndex(series, (s) => ({
        title: s.title,
        year: s.year ? Number(s.year) : undefined,
      })),
    [series],
  );
  const shownSeries = useMemo(
    () => filterSeries(filterLibraryIndex(seriesIndex, query), filter),
    [seriesIndex, query, filter],
  );

  const counts = kind === "movies" ? movieCounts : seriesCounts;
  const allBusy = searchingAll.has(kind);
  const missingTotal = counts.missing;
  const filtered = filter !== "all" || !!langFilter || query.trim().length > 0;

  const openMovie = radarrId
    ? (m: BazarrMovie) =>
        router.push(`/movie/${m.radarrId}?instanceId=${radarrId}`)
    : undefined;
  const openSeries = sonarrId
    ? (s: BazarrSeries) =>
        router.push(`/series/${s.sonarrSeriesId}?instanceId=${sonarrId}`)
    : undefined;

  const listHeader = (
    <View>
      {header}
      <SegmentedControl
        options={[
          { value: "movies", label: "Movies" },
          { value: "series", label: "Series" },
        ]}
        value={kind}
        onChange={(k) => {
          // Re-tapping the current kind is not a switch.
          if (k === kind) return;
          setLangFilter(null);
          onKindChange(k);
        }}
        className="mb-3"
      />
      {kind === "movies" ? (
        <CoverageBars
          coverage={coverage}
          selected={langFilter}
          onSelect={(next) => {
            lightHaptic();
            setLangFilter(next);
          }}
        />
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-3"
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f}
            label={
              f === "all" ? FILTER_LABEL[f] : `${FILTER_LABEL[f]} ${counts[f]}`
            }
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
      {filter === "missing" && missingTotal > 0 ? (
        <Pressable
          onPress={() => {
            const k = kind;
            setSearchingAll((prev) => new Set([...prev, k]));
            // mutateAsync: movies and series can both be started in a row.
            searchAll.mutateAsync(k).then(
              () =>
                toast(
                  `Searching every missing ${k === "movies" ? "movie" : "episode"} subtitle…`,
                  "info",
                ),
              (err) => {
                setSearchingAll((prev) => {
                  const next = new Set(prev);
                  next.delete(k);
                  return next;
                });
                toastError("Couldn't start the search", err);
              },
            );
          }}
          disabled={allBusy}
          className={`flex-row items-center justify-center gap-2 rounded-xl border border-orange-400/40 bg-orange-400/10 py-2.5 mb-3 active:opacity-70 ${
            allBusy ? "opacity-60" : ""
          }`}
          accessibilityRole="button"
          accessibilityState={{ disabled: allBusy, busy: allBusy }}
        >
          {allBusy ? (
            <ActivityIndicator size="small" color={tc("#fdba74")} />
          ) : (
            <Icon icon={Search} size={14} color="#fdba74" />
          )}
          <Text className="text-orange-300 text-sm font-semibold">
            {allBusy ? "Searching…" : `Search all ${missingTotal} missing`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );

  const empty = (
    <EmptyState
      icon={<Icon icon={Captions} size={32} color="#71717a" />}
      title={
        filtered
          ? `No ${kind === "movies" ? "movies" : "series"} match`
          : `Bazarr has no ${kind === "movies" ? "movies" : "series"} yet`
      }
      message={
        filtered
          ? undefined
          : "They appear once Bazarr syncs with Radarr and Sonarr."
      }
      action={
        filtered ? (
          <Button
            label="Clear filters"
            variant="outline"
            onPress={() => {
              setFilter("all");
              setLangFilter(null);
              onClearSearch();
            }}
          />
        ) : undefined
      }
    />
  );

  if (kind === "movies") {
    return (
      <LibraryCollection
        mode={mode}
        data={shownMovies}
        keyOf={(m) => String(m.radarrId)}
        renderRow={(m) => (
          <BazarrMovieRow
            movie={m}
            lookup={movieLookup.get(m.radarrId)}
            arrInstanceId={radarrId}
            showSearch={
              (filter === "missing" || langFilter?.show === "missing") &&
              m.missing_subtitles.length > 0
            }
            searching={busyMovies.has(m.radarrId)}
            onSearch={() => {
              // Busy from the tap, cleared when Bazarr's queue drains.
              // mutateAsync: mutate's per-call callbacks only fire for the
              // latest call, and rows are searched in quick succession.
              setBusyMovies((prev) => new Set([...prev, m.radarrId]));
              inFlightMovies.current.add(m.radarrId);
              searchMovie
                .mutateAsync(m.radarrId)
                .finally(() => inFlightMovies.current.delete(m.radarrId))
                .then(
                  () => toast(`Searching subtitles for ${m.title}…`, "info"),
                  (err) => {
                    setBusyMovies((prev) => {
                      const next = new Set(prev);
                      next.delete(m.radarrId);
                      return next;
                    });
                    toastError("Couldn't start the search", err);
                  },
                );
            }}
            onPress={openMovie ? () => openMovie(m) : undefined}
          />
        )}
        renderCell={(m, width) => (
          <BazarrMoviePoster
            movie={m}
            lookup={movieLookup.get(m.radarrId)}
            arrInstanceId={radarrId}
            width={width}
            onPress={openMovie ? () => openMovie(m) : undefined}
          />
        )}
        isLoading={moviesQuery.isLoading}
        error={moviesQuery.error}
        errorTitle="Couldn't load Bazarr's movies"
        empty={empty}
        ListHeaderComponent={listHeader}
        refreshControl={refreshControl}
        contentContainerStyle={contentContainerStyle}
      />
    );
  }

  return (
    <LibraryCollection
      mode={mode}
      data={shownSeries}
      keyOf={(s) => String(s.sonarrSeriesId)}
      renderRow={(s) => (
        <BazarrSeriesRow
          series={s}
          lookup={seriesLookup.get(s.sonarrSeriesId)}
          arrInstanceId={sonarrId}
          bazarrId={bazarrId}
          expandable={filter === "missing"}
          searchingEpisodes={busyEpisodes}
          onSearchEpisode={(e) => {
            setBusyEpisodes((prev) => new Set([...prev, e.sonarrEpisodeId]));
            inFlightEpisodes.current.add(e.sonarrEpisodeId);
            searchEpisode
              .mutateAsync(e)
              .finally(() => inFlightEpisodes.current.delete(e.sonarrEpisodeId))
              .then(
                () => toast(`Searching subtitles for ${s.title}…`, "info"),
                (err) => {
                  setBusyEpisodes((prev) => {
                    const next = new Set(prev);
                    next.delete(e.sonarrEpisodeId);
                    return next;
                  });
                  toastError("Couldn't start the search", err);
                },
              );
          }}
          onPress={openSeries ? () => openSeries(s) : undefined}
        />
      )}
      renderCell={(s, width) => (
        <BazarrSeriesPoster
          series={s}
          lookup={seriesLookup.get(s.sonarrSeriesId)}
          arrInstanceId={sonarrId}
          width={width}
          onPress={openSeries ? () => openSeries(s) : undefined}
        />
      )}
      isLoading={seriesQuery.isLoading}
      error={seriesQuery.error}
      errorTitle="Couldn't load Bazarr's series"
      empty={empty}
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
