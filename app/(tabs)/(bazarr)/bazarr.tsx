import { useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { RefreshControl } from "react-native";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { LibraryToolbar } from "@/components/common/library-toolbar";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import {
  BazarrLibraryView,
  useLibrarySearchBusy,
  type BazarrLibraryKind,
} from "@/components/bazarr/library-view";
import { BazarrHistoryView, type HistoryFilter } from "@/components/bazarr/history-view";
import type { LanguageFilter, LibraryFilter } from "@/lib/bazarr-library";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useItemsArrInstance } from "@/hooks/use-bazarr-link";
import { useLibraryView } from "@/hooks/use-library-view";
import { useLibrarySearch } from "@/hooks/use-library-search";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useUiScale } from "@/hooks/use-ui-scale";

type Section = "library" | "history";

const linkFilter = (v?: string): LibraryFilter | null =>
  v === "missing" || v === "complete" || v === "noprofile" || v === "all" ? v : null;
const linkKind = (v?: string): BazarrLibraryKind | null =>
  v === "movies" || v === "series" ? v : null;

export default function BazarrScreen() {
  return (
    <WorkspaceServiceGuard kinds={["bazarr"]}>
      <BazarrScreenInner />
    </WorkspaceServiceGuard>
  );
}

/**
 * The Bazarr tab: Library (every movie and series with its subtitles) and
 * History, switched from the header. Each view is the screen's single
 * scroll container, with the header scrolling along.
 */
function BazarrScreenInner() {
  // `?filter=missing&kind=series` opens the tab on a filter (the dashboard's
  // Wanted card links here, Missing having replaced Wanted).
  const router = useRouter();
  const params = useLocalSearchParams<{ filter?: string; kind?: string }>();
  const [section, setSection] = useState<Section>("library");
  // Seeded from a link on the first mount, so a cold link doesn't first
  // fetch the whole movie library only to switch to series.
  const [kind, setKind] = useState<BazarrLibraryKind>(() => linkKind(params.kind) ?? "movies");
  const [filter, setFilter] = useState<LibraryFilter>(() => linkFilter(params.filter) ?? "all");
  const search = useLibrarySearch();
  // A coverage bar's filter. Held here, not in the library view, which
  // unmounts on a switch to History.
  const [langFilter, setLangFilter] = useState<LanguageFilter | null>(null);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  useEffect(() => {
    if (!params.filter && !params.kind) return;
    // Consumed, so the next tap on the same link changes the params again:
    // the tab stays mounted and would otherwise keep whatever the user picked.
    router.setParams({ filter: undefined, kind: undefined });
    const nextFilter = linkFilter(params.filter);
    if (nextFilter) {
      setSection("library");
      setFilter(nextFilter);
    }
    const nextKind = linkKind(params.kind);
    if (nextKind) setKind(nextKind);
    // The list must match what the link promised (the card's Missing count),
    // not a search or language filter left from before.
    search.reset();
    setLangFilter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.filter, params.kind]);
  const view = useLibraryView(`bazarr-${kind}`);

  const { instanceId: bazarrId } = useInstanceTarget("bazarr");
  const searchBusy = useLibrarySearchBusy(bazarrId);
  // A language another instance's profiles may not ask for.
  const [langFor, setLangFor] = useState(bazarrId);
  if (langFor !== bazarrId) {
    setLangFor(bazarrId);
    setLangFilter(null);
  }
  // Pull-to-refresh also refreshes the arr library behind the artwork and
  // original language (kept 5 minutes otherwise), the one the Library reads.
  const radarrId = useItemsArrInstance(bazarrId, "radarr");
  const sonarrId = useItemsArrInstance(bazarrId, "sonarr");
  const { data: healthData } = useServiceHealth();
  const online = healthData?.find((s) => s.id === "bazarr")?.online;
  // Not every Bazarr query: link detection re-reads /system/settings, which
  // holds every provider secret, and only needs that on "Detect again".
  const refreshKeys = useMemo(
    () => [
      ["bazarr", bazarrId, "library"],
      ["bazarr", bazarrId, "history"],
      ["bazarr", bazarrId, "profiles"],
      ["bazarr", bazarrId, "series-episodes"],
      // Only the one on screen: each is a whole-library download.
      ...(section === "library" && kind === "movies" && radarrId ? [["radarr", radarrId, "movies"]] : []),
      ...(section === "library" && kind === "series" && sonarrId ? [["sonarr", sonarrId, "series"]] : []),
    ],
    [bazarrId, section, kind, radarrId, sonarrId],
  );
  const { refreshing, onRefresh } = usePullToRefresh(refreshKeys);
  const theme = useAppTheme();
  const tc = useThemeColor();
  const uiScale = useUiScale();
  const bottomPadding = useScreenBottomPadding();

  // Horizontal padding comes from ScreenWrapper's px-4.
  const contentContainerStyle = { paddingTop: 7 * uiScale, paddingBottom: bottomPadding };
  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor={tc("#3b82f6")}
      colors={[tc("#3b82f6")]}
      progressBackgroundColor={theme.surface}
    />
  );

  const header = (
    <LibraryToolbar<Section>
      title="Bazarr"
      serviceId="bazarr"
      online={online}
      segments={{
        options: [
          { value: "library", label: "Library" },
          { value: "history", label: "History" },
        ],
        value: section,
        onChange: (next) => {
          setSection(next);
          search.reset();
        },
      }}
      search={
        section === "library"
          ? {
              ...search.toolbar,
              placeholder: kind === "movies" ? "Search movies" : "Search series",
            }
          : undefined
      }
      view={section === "library" ? { mode: view.mode, onToggle: view.toggle } : undefined}
    />
  );

  if (!bazarrId) return <ScreenWrapper scrollable={false}>{header}</ScreenWrapper>;

  return (
    <ScreenWrapper scrollable={false}>
      {section === "library" ? (
        <BazarrLibraryView
          // A language filter or busy rows mean nothing on another instance.
          key={bazarrId}
          bazarrId={bazarrId}
          langFilter={langFilter}
          onLangFilterChange={setLangFilter}
          searchBusy={searchBusy}
          kind={kind}
          onKindChange={setKind}
          filter={filter}
          onFilterChange={setFilter}
          mode={view.mode}
          query={search.applied}
          onClearSearch={search.reset}
          header={header}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}
        />
      ) : (
        <BazarrHistoryView
          // Blacklisted entries and an open sheet belong to one instance.
          key={bazarrId}
          bazarrId={bazarrId}
          filter={historyFilter}
          onFilterChange={setHistoryFilter}
          header={header}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
    </ScreenWrapper>
  );
}
