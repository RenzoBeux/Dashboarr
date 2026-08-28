import { useEffect, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { FilterChip } from "@/components/ui/filter-chip";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useServiceHealth } from "@/hooks/use-service-health";
import { NavidromeOverview } from "@/components/navidrome/navidrome-overview";
import { NavidromeBrowse } from "@/components/navidrome/navidrome-browse";
import { NavidromePlaylists } from "@/components/navidrome/navidrome-playlists";
import { openNavidromeWebUi } from "@/components/navidrome/open-web-ui";
import { ICON } from "@/lib/constants";
import { lightHaptic } from "@/lib/haptics";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "browse", label: "Browse" },
  { key: "playlists", label: "Playlists" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default function NavidromeScreen() {
  return (
    <WorkspaceServiceGuard kinds={["navidrome"]}>
      <NavidromeScreenInner />
    </WorkspaceServiceGuard>
  );
}

function NavidromeScreenInner() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["navidrome"]]);

  // `?q=` lets global search's "Show all" land on Browse with the term already
  // typed in, the way ?source= deep-links the Indexers tab.
  const { q: queryParam } = useLocalSearchParams<{ q?: string }>();
  const initialQuery = typeof queryParam === "string" ? queryParam : "";

  const [tab, setTab] = useState<Tab>(initialQuery ? "browse" : "overview");
  // Owned here rather than inside NavidromeBrowse so switching to Overview and
  // back doesn't discard what the user typed (Browse is unmounted while hidden).
  const [browseQuery, setBrowseQuery] = useState(initialQuery);

  // Re-target when the param changes while this tab is already mounted, e.g.
  // the user searches again and taps "Show all" a second time.
  useEffect(() => {
    if (!initialQuery) return;
    setBrowseQuery(initialQuery);
    setTab("browse");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between">
        <ServiceHeader
          name="Navidrome"
          online={healthData?.find((s) => s.id === "navidrome")?.online}
          serviceId="navidrome"
        />
        <Pressable
          onPress={() => openNavidromeWebUi("album")}
          accessibilityRole="button"
          accessibilityLabel="Open Navidrome"
          className="p-2 active:opacity-70"
        >
          <Icon icon={ExternalLink} size={ICON.LG} color="#a1a1aa" />
        </Pressable>
      </View>
      <CachedDataBanner serviceId="navidrome" label="Navidrome" />

      {/* Horizontal ScrollView, not a flex-row: at higher UI scales the chips
          grow with rem and would otherwise run off-screen with no way back. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {TABS.map((t) => (
          <FilterChip
            key={t.key}
            label={t.label}
            selected={tab === t.key}
            onPress={() => {
              lightHaptic();
              setTab(t.key);
            }}
          />
        ))}
      </ScrollView>

      {tab === "overview" && <NavidromeOverview />}
      {tab === "browse" && (
        <NavidromeBrowse query={browseQuery} onQueryChange={setBrowseQuery} />
      )}
      {tab === "playlists" && <NavidromePlaylists />}
    </ScreenWrapper>
  );
}
