import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useShallow } from "zustand/react/shallow";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { FilterChip } from "@/components/ui/filter-chip";
import { HealthIssuesBanner } from "@/components/services/health-issues-banner";
import { ProwlarrIndexerList } from "@/components/indexers/prowlarr-indexer-list";
import { ProwlarrStats } from "@/components/indexers/prowlarr-stats";
import { JackettIndexerList } from "@/components/indexers/jackett-indexer-list";
import { Nzbhydra2IndexerList } from "@/components/indexers/nzbhydra2-indexer-list";
import { Nzbhydra2Stats } from "@/components/indexers/nzbhydra2-stats";
import { Nzbhydra2History } from "@/components/indexers/nzbhydra2-history";
import { ReleaseSearch } from "@/components/indexers/release-search";
import type { SearchScope } from "@/components/indexers/release-search";
import { prowlarrIndexerAdapter } from "@/lib/indexer-adapters/prowlarr";
import { jackettIndexerAdapter } from "@/lib/indexer-adapters/jackett";
import { nzbhydra2IndexerAdapter } from "@/lib/indexer-adapters/nzbhydra2";
import type { IndexerSearchAdapter } from "@/lib/indexer-adapter";
import type { ArrHealthServiceId } from "@/services/arr-health";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";

// Source order is also the fallback order (`sources[0]`), so new kinds are
// APPENDED — an existing install keeps landing on Prowlarr exactly as before.
const SOURCE_ORDER = ["prowlarr", "jackett", "nzbhydra2"] as const;
type IndexerSource = (typeof SOURCE_ORDER)[number];

type Tab = "indexers" | "search" | "stats" | "history";

// Any indexer list may pin the Search sub-tab to one tracker (#315). Sources
// whose list has no per-row Search button simply never call it.
interface IndexerListProps {
  onSearch?: (indexer: { id: string; name: string }) => void;
}

interface IndexerSourceConfig {
  // Sub-tab chips, in render order. Capability-driven: Jackett has no
  // admin-free stats endpoint, and only NZBHydra2 exposes history.
  tabs: readonly Tab[];
  adapter: IndexerSearchAdapter;
  IndexerList: ComponentType<IndexerListProps>;
  Stats?: ComponentType;
  History?: ComponentType;
  // Prowlarr is the only *arr on this screen, so its System > Health banner is
  // opt-in here rather than a branch in the JSX.
  healthBanner?: ArrHealthServiceId;
}

// One table instead of a chain of two-valued ternaries: with three sources the
// capability matrix (who has Stats? who has History? who gets the health
// banner?) would otherwise be spread across the JSX, and a fourth source is
// now a single object literal.
const SOURCES: Record<IndexerSource, IndexerSourceConfig> = {
  prowlarr: {
    tabs: ["indexers", "search", "stats"],
    adapter: prowlarrIndexerAdapter,
    IndexerList: ProwlarrIndexerList,
    Stats: ProwlarrStats,
    healthBanner: "prowlarr",
  },
  jackett: {
    tabs: ["indexers", "search"],
    adapter: jackettIndexerAdapter,
    IndexerList: JackettIndexerList,
  },
  nzbhydra2: {
    tabs: ["indexers", "search", "stats", "history"],
    adapter: nzbhydra2IndexerAdapter,
    IndexerList: Nzbhydra2IndexerList,
    Stats: Nzbhydra2Stats,
    History: Nzbhydra2History,
  },
};

const GUARDED_KINDS: ServiceId[] = [...SOURCE_ORDER];

// `?source=...` lets the Services tab / dashboard widgets / global search
// deep-link straight to the matching source (mirrors the Downloads tab's
// `?client=`).
function isIndexerSource(value: string | undefined): value is IndexerSource {
  return !!value && (SOURCE_ORDER as readonly string[]).includes(value);
}

export default function IndexersScreen() {
  return (
    <WorkspaceServiceGuard kinds={GUARDED_KINDS}>
      <IndexersScreenInner />
    </WorkspaceServiceGuard>
  );
}

function IndexersScreenInner() {
  // One selector over SOURCE_ORDER instead of a useConfigStore call per kind:
  // rules of hooks forbid looping hook calls, and useShallow keeps the
  // freshly-mapped array from re-rendering on every unrelated store write.
  const enabledFlags = useConfigStore(
    useShallow((s) => SOURCE_ORDER.map((id) => s.services[id]?.enabled ?? false)),
  );
  const attachedKinds = useAttachedKinds();

  const sources = SOURCE_ORDER.filter(
    (id, i) => enabledFlags[i] && attachedKinds.has(id),
  );

  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const paramSource = isIndexerSource(sourceParam) ? sourceParam : undefined;

  const [source, setSource] = useState<IndexerSource>(
    paramSource && sources.includes(paramSource)
      ? paramSource
      : sources[0] ?? "prowlarr",
  );
  const [tab, setTab] = useState<Tab>("indexers");
  // Set by the per-indexer Search button in the indexer list (#315): pins the
  // Search sub-tab to that one tracker until the user clears the pill.
  const [searchScope, setSearchScope] = useState<SearchScope | null>(null);

  // Re-select when the deep-link param changes (e.g. user is already on this
  // tab and taps another indexer tile in the Services tab).
  useEffect(() => {
    if (paramSource && sources.includes(paramSource) && paramSource !== source) {
      setSource(paramSource);
      // An indexer id only means something to the source it came from.
      setSearchScope(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSource]);

  const activeSource: IndexerSource = sources.includes(source)
    ? source
    : sources[0] ?? "prowlarr";
  const config = SOURCES[activeSource];
  // A source switch can strand the sub-tab on a chip the new source doesn't
  // have (Stats → Jackett, History → Prowlarr) — snap back to Indexers.
  const activeTab: Tab = config.tabs.includes(tab) ? tab : "indexers";

  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([[activeSource]]);

  const health = healthData?.find((s) => s.id === activeSource);

  const IndexerList = config.IndexerList;
  const StatsBody = config.Stats;
  const HistoryBody = config.History;

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader
        name="Indexers"
        online={health?.online}
        serviceId={activeSource}
      />

      {/* Both chip rows stay horizontally scrollable. This is exactly the case
          the rule exists for: at UI scale 1.3 a three-chip source row and a
          four-chip sub-tab row both exceed a phone viewport. */}
      {sources.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="mb-3"
        >
          {sources.map((s) => (
            <FilterChip
              key={s}
              label={SERVICE_DEFAULTS[s].name}
              selected={activeSource === s}
              onPress={() => {
                setSource(s);
                setSearchScope(null);
              }}
            />
          ))}
        </ScrollView>
      )}

      {config.healthBanner && (
        <HealthIssuesBanner serviceId={config.healthBanner} className="mb-4" />
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {config.tabs.map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={activeTab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>

      {activeTab === "indexers" && (
        <IndexerList
          onSearch={(indexer) => {
            setSearchScope({ id: indexer.id, name: indexer.name });
            setTab("search");
          }}
        />
      )}
      {activeTab === "search" && (
        <ReleaseSearch
          key={activeSource}
          adapter={config.adapter}
          scope={searchScope}
          onClearScope={() => setSearchScope(null)}
        />
      )}
      {activeTab === "stats" && StatsBody ? <StatsBody /> : null}
      {activeTab === "history" && HistoryBody ? <HistoryBody /> : null}
    </ScreenWrapper>
  );
}
