import { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { FilterChip } from "@/components/ui/filter-chip";
import { HealthIssuesBanner } from "@/components/services/health-issues-banner";
import { ProwlarrIndexerList } from "@/components/indexers/prowlarr-indexer-list";
import { ProwlarrStats } from "@/components/indexers/prowlarr-stats";
import { JackettIndexerList } from "@/components/indexers/jackett-indexer-list";
import { ReleaseSearch } from "@/components/indexers/release-search";
import { prowlarrIndexerAdapter } from "@/lib/indexer-adapters/prowlarr";
import { jackettIndexerAdapter } from "@/lib/indexer-adapters/jackett";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { SERVICE_DEFAULTS } from "@/lib/constants";

type IndexerSource = "prowlarr" | "jackett";
type Tab = "indexers" | "search" | "stats";

// Sub-tabs per source: Jackett has no admin-free stats endpoint, so its Stats
// chip simply doesn't exist.
const TABS_FOR_SOURCE: Record<IndexerSource, Tab[]> = {
  prowlarr: ["indexers", "search", "stats"],
  jackett: ["indexers", "search"],
};

export default function IndexersScreen() {
  return (
    <WorkspaceServiceGuard kinds={["prowlarr", "jackett"]}>
      <IndexersScreenInner />
    </WorkspaceServiceGuard>
  );
}

function IndexersScreenInner() {
  const prowlarrEnabled = useConfigStore((s) => s.services.prowlarr.enabled);
  const jackettEnabled = useConfigStore((s) => s.services.jackett?.enabled ?? false);
  const attachedKinds = useAttachedKinds();

  const sources: IndexerSource[] = [];
  if (prowlarrEnabled && attachedKinds.has("prowlarr")) sources.push("prowlarr");
  if (jackettEnabled && attachedKinds.has("jackett")) sources.push("jackett");

  // `?source=...` lets the Services tab / dashboard widgets deep-link straight
  // to the matching source (mirrors the Downloads tab's `?client=`).
  const { source: sourceParam } = useLocalSearchParams<{ source?: string }>();
  const paramSource =
    sourceParam === "prowlarr" || sourceParam === "jackett" ? sourceParam : undefined;

  const [source, setSource] = useState<IndexerSource>(
    paramSource && sources.includes(paramSource) ? paramSource : sources[0] ?? "prowlarr",
  );
  const [tab, setTab] = useState<Tab>("indexers");

  // Re-select when the deep-link param changes (e.g. user is already on this
  // tab and taps the other indexer tile in the Services tab).
  useEffect(() => {
    if (paramSource && sources.includes(paramSource) && paramSource !== source) {
      setSource(paramSource);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSource]);

  const activeSource: IndexerSource = sources.includes(source)
    ? source
    : sources[0] ?? "prowlarr";
  // A source switch can strand the sub-tab on a chip the new source doesn't
  // have (Stats → Jackett) — snap back to Indexers.
  const activeTab: Tab = TABS_FOR_SOURCE[activeSource].includes(tab)
    ? tab
    : "indexers";

  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([[activeSource]]);

  const health = healthData?.find((s) => s.id === activeSource);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Indexers" online={health?.online} serviceId={activeSource} />

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
              onPress={() => setSource(s)}
            />
          ))}
        </ScrollView>
      )}

      {activeSource === "prowlarr" && (
        <HealthIssuesBanner serviceId="prowlarr" className="mb-4" />
      )}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {TABS_FOR_SOURCE[activeSource].map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={activeTab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>

      {activeTab === "indexers" &&
        (activeSource === "prowlarr" ? <ProwlarrIndexerList /> : <JackettIndexerList />)}
      {activeTab === "search" && (
        <ReleaseSearch
          key={activeSource}
          adapter={
            activeSource === "prowlarr" ? prowlarrIndexerAdapter : jackettIndexerAdapter
          }
        />
      )}
      {activeTab === "stats" && activeSource === "prowlarr" && <ProwlarrStats />}
    </ScreenWrapper>
  );
}
