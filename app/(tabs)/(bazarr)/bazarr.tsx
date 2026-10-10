import { useState } from "react";
import { RefreshControl } from "react-native";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { LibraryToolbar } from "@/components/common/library-toolbar";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { BazarrLibraryView, type BazarrLibraryKind } from "@/components/bazarr/library-view";
import { BazarrHistoryView } from "@/components/bazarr/history-view";
import { useServiceHealth } from "@/hooks/use-service-health";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useLibraryView } from "@/hooks/use-library-view";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAppTheme } from "@/hooks/use-app-theme";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useUiScale } from "@/hooks/use-ui-scale";

type Section = "library" | "history";

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
  const [section, setSection] = useState<Section>("library");
  const [kind, setKind] = useState<BazarrLibraryKind>("movies");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query, 200);
  const view = useLibraryView(`bazarr-${kind}`);

  const { instanceId: bazarrId } = useInstanceTarget("bazarr");
  const { data: healthData } = useServiceHealth();
  const online = healthData?.find((s) => s.id === "bazarr")?.online;
  const { refreshing, onRefresh } = usePullToRefresh([["bazarr"]]);
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
          setSearchOpen(false);
          setQuery("");
        },
      }}
      search={
        section === "library"
          ? {
              open: searchOpen,
              onToggle: () => {
                if (searchOpen) setQuery("");
                setSearchOpen(!searchOpen);
              },
              query,
              onQuery: setQuery,
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
          bazarrId={bazarrId}
          kind={kind}
          onKindChange={setKind}
          mode={view.mode}
          query={debouncedQuery}
          header={header}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}
        />
      ) : (
        <BazarrHistoryView
          bazarrId={bazarrId}
          header={header}
          refreshControl={refreshControl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
    </ScreenWrapper>
  );
}
