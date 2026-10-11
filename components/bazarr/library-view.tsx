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
import { Captions, ScanSearch, Search } from "lucide-react-native";
import { LibraryCollection } from "@/components/common/library-collection";
import { ConfirmModal } from "@/components/common/confirm-modal";
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
import { useItemsArrInstance } from "@/hooks/use-bazarr-link";
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
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
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
const ARR_LOOKUP_STALE_MS = 5 * 60_000;
// A library-wide search can keep Bazarr's queue busy far past the job
// watcher's default 2 minutes; "Searching…" holds until it drains.
const SEARCH_ALL_WATCH_MS = 30 * 60_000;
// Stable empties: a fresh [] per render would rebuild every memo below.
const NO_MOVIES: BazarrMovie[] = [];
const NO_SERIES: BazarrSeries[] = [];

/**
 * Searches the user started from the library, until Bazarr's queue drains.
 * Held by the screen, not the library view, which unmounts on a switch to
 * History: coming back mid-search must not re-enable "Search all" (a second
 * tap queues every search again) or drop the rows' spinners.
 */
export function useLibrarySearchBusy(bazarrId: string | null) {
  const jobsActive = useBazarrJobsActive(bazarrId);
  const [busyMovies, setBusyMovies] = useState<ReadonlySet<number>>(new Set());
  const [busyEpisodes, setBusyEpisodes] = useState<ReadonlySet<number>>(new Set());
  // "Search all" answers at once on Bazarr 1.5.6+ while the searches queue;
  // held until the queue drains so a second tap doesn't queue them again.
  const [searchingAll, setSearchingAll] = useState<ReadonlySet<BazarrLibraryKind>>(new Set());
  // Requests not answered yet: their jobs aren't tracked, so another
  // search's queue draining must not clear them.
  const inFlightMovies = useRef(new Set<number>());
  const inFlightEpisodes = useRef(new Set<number>());
  const inFlightAll = useRef(new Set<BazarrLibraryKind>());
  const [wasActive, setWasActive] = useState(false);
  const [forId, setForId] = useState(bazarrId);
  // Bumped per instance switch: a late answer from before it (even from the
  // same instance, switched away and back) must not touch today's rows.
  const generation = useRef(0);
  if (forId !== bazarrId) {
    // Ids of another instance's Radarr/Sonarr. Fresh in-flight sets: the
    // old instance's requests settle into the sets they captured.
    setForId(bazarrId);
    generation.current += 1;
    setWasActive(jobsActive);
    setBusyMovies(new Set());
    setBusyEpisodes(new Set());
    setSearchingAll(new Set());
    inFlightMovies.current = new Set();
    inFlightEpisodes.current = new Set();
    inFlightAll.current = new Set();
  } else if (jobsActive !== wasActive) {
    setWasActive(jobsActive);
    if (!jobsActive) {
      setBusyMovies(new Set(inFlightMovies.current));
      setBusyEpisodes(new Set(inFlightEpisodes.current));
      setSearchingAll(new Set(inFlightAll.current));
    }
  }
  // Busy from the tap until the queue drains (or the request fails).
  // mutateAsync, not mutate: its per-call callbacks only fire for the latest
  // call, and searches are started in quick succession.
  function start<K>(
    setBusy: React.Dispatch<React.SetStateAction<ReadonlySet<K>>>,
    flightRef: React.MutableRefObject<Set<K>>,
    key: K,
    run: () => Promise<unknown>,
    onStarted: () => void,
  ) {
    const flight = flightRef.current;
    const gen = generation.current;
    setBusy((prev) => new Set([...prev, key]));
    flight.add(key);
    run()
      .finally(() => flight.delete(key))
      .then(onStarted, (err) => {
        if (generation.current === gen) {
          setBusy((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        }
        toastError("Couldn't start the search", err);
      });
  }
  return {
    busyMovies,
    busyEpisodes,
    searchingAll,
    startMovie: (id: number, run: () => Promise<unknown>, onStarted: () => void) =>
      start(setBusyMovies, inFlightMovies, id, run, onStarted),
    startEpisode: (id: number, run: () => Promise<unknown>, onStarted: () => void) =>
      start(setBusyEpisodes, inFlightEpisodes, id, run, onStarted),
    startAll: (kind: BazarrLibraryKind, run: () => Promise<unknown>, onStarted: () => void) =>
      start(setSearchingAll, inFlightAll, kind, run, onStarted),
  };
}

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
  langFilter,
  onLangFilterChange: setLangFilter,
  searchBusy,
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
  // A coverage bar's filter, held by the screen (reset by a link).
  langFilter: LanguageFilter | null;
  onLangFilterChange: (filter: LanguageFilter | null) => void;
  searchBusy: ReturnType<typeof useLibrarySearchBusy>;
  header: React.ReactElement;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const tc = useThemeColor();

  const moviesQuery = useBazarrMovieLibrary(bazarrId, kind === "movies");
  const seriesQuery = useBazarrSeriesLibrary(bazarrId, kind === "series");
  const { data: profiles } = useBazarrLanguageProfiles(bazarrId);

  // Artwork, original language and "open" come from the arr Bazarr's ids
  // belong to: the linked one, else the only one (useItemsArrInstance, the
  // dashboard card's rule too).
  const radarrId = useItemsArrInstance(bazarrId, "radarr");
  const sonarrId = useItemsArrInstance(bazarrId, "sonarr");
  // Artwork and original language only: a History visit or kind switch
  // shouldn't download the whole Radarr/Sonarr library again.
  const { data: radarrMovies } = useRadarrMovies(
    radarrId ?? undefined,
    !!radarrId && kind === "movies",
    ARR_LOOKUP_STALE_MS,
  );
  const { data: sonarrSeries } = useSonarrSeries(
    sonarrId ?? undefined,
    !!sonarrId && kind === "series",
    ARR_LOOKUP_STALE_MS,
  );
  // No arr resolved: no lookup at all. A disabled query can still hand back the
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

  const { busyMovies, busyEpisodes, searchingAll } = searchBusy;
  // "Search all"'s confirm. Nothing chains off it, so plain state rather
  // than useModalFlow; the kind can't change while it covers the screen.
  const [confirmAll, setConfirmAll] = useState(false);

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
    SEARCH_ALL_WATCH_MS,
  );

  // --- Movies ---
  const movies = moviesQuery.data ?? NO_MOVIES;
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
  // The search index is built once a search starts, for the kind on screen
  // only, and kept across keystrokes: keyed on searching or not, not on the
  // query. Browsing never normalizes the whole library.
  const searching = query.trim().length > 0;
  const searchingMovies = searching && kind === "movies";
  const movieIndex = useMemo(
    () =>
      searchingMovies
        ? buildLibraryIndex(movies, (m) => ({
            title: m.title,
            year: m.year ? Number(m.year) : undefined,
          }))
        : null,
    [movies, searchingMovies],
  );
  // Only the kind on screen is filtered: each keystroke would otherwise
  // re-score the hidden library too.
  const shownMovies = useMemo(
    () =>
      kind === "movies"
        ? filterMovies(
            movieIndex ? filterLibraryIndex(movieIndex, query) : movies,
            filter,
            langFilter,
            profileLangs,
          )
        : NO_MOVIES,
    [kind, movies, movieIndex, query, filter, langFilter, profileLangs],
  );

  // --- Series ---
  const series = seriesQuery.data ?? NO_SERIES;
  const seriesCounts = useMemo(
    () => filterCounts(series, classifySeries),
    [series],
  );
  const searchingSeries = searching && kind === "series";
  const seriesIndex = useMemo(
    () =>
      searchingSeries
        ? buildLibraryIndex(series, (s) => ({
            title: s.title,
            year: s.year ? Number(s.year) : undefined,
          }))
        : null,
    [series, searchingSeries],
  );
  const shownSeries = useMemo(
    () =>
      kind === "series"
        ? filterSeries(seriesIndex ? filterLibraryIndex(seriesIndex, query) : series, filter)
        : NO_SERIES,
    [kind, series, seriesIndex, query, filter],
  );

  const counts = kind === "movies" ? movieCounts : seriesCounts;
  const allBusy = searchingAll.has(kind);
  const missingTotal = counts.missing;
  const filtered = filter !== "all" || !!langFilter || searching;

  // Opened from the subtitle tab: land on the movie's Subtitles expanded,
  // as History's links do.
  const openMovie = radarrId
    ? (m: BazarrMovie) =>
        router.push(`/movie/${m.radarrId}?instanceId=${radarrId}&subtitles=open`)
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
            mediumHaptic();
            setConfirmAll(true);
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

  // Like Radarr/Sonarr's "Search Missing": one tap queues a search per item.
  const confirmSearchAll = (
    <ConfirmModal
      visible={confirmAll}
      title="Search Missing Subtitles"
      message={`Bazarr will search every missing ${
        kind === "movies" ? "movie" : "episode"
      } subtitle in your library. This can queue a lot of searches at once.`}
      icon={ScanSearch}
      confirmLabel="Search"
      onCancel={() => setConfirmAll(false)}
      onConfirm={() => {
        const k = kind;
        setConfirmAll(false);
        searchBusy.startAll(
          k,
          () => searchAll.mutateAsync(k),
          () =>
            toast(
              `Searching every missing ${k === "movies" ? "movie" : "episode"} subtitle…`,
              "info",
            ),
        );
      }}
    />
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
      <>
        <LibraryCollection
          // Its own list per kind: the same FlatList would carry the movies'
          // scroll offset into the series list.
          key="movies"
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
              onSearch={() =>
                searchBusy.startMovie(
                  m.radarrId,
                  () => searchMovie.mutateAsync(m.radarrId),
                  () => toast(`Searching subtitles for ${m.title}…`, "info"),
                )
              }
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
          // Only a failed first load: after a failed refetch the loaded
          // library still shows, and an empty filter result must still offer
          // "Clear filters" rather than an error.
          error={moviesQuery.data ? null : moviesQuery.error}
          errorTitle="Couldn't load Bazarr's movies"
          empty={empty}
          ListHeaderComponent={listHeader}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}
        />
        {confirmSearchAll}
      </>
    );
  }

  return (
    <>
      <LibraryCollection
        key="series"
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
            onSearchEpisode={(e) =>
              searchBusy.startEpisode(
                e.sonarrEpisodeId,
                () => searchEpisode.mutateAsync(e),
                () => toast(`Searching subtitles for ${s.title}…`, "info"),
              )
            }
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
        error={seriesQuery.data ? null : seriesQuery.error}
        errorTitle="Couldn't load Bazarr's series"
        empty={empty}
        ListHeaderComponent={listHeader}
        refreshControl={refreshControl}
        contentContainerStyle={contentContainerStyle}
      />
      {confirmSearchAll}
    </>
  );
}
