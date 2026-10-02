import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Monitor, ScrollText } from "lucide-react-native";
import { ActionSheet } from "@/components/ui/action-sheet";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { ClientRow } from "@/components/adguard/client-row";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { TextInput } from "@/components/ui/text-input";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useAdguardClients,
  useAdguardDhcpStatus,
  useAdguardStats,
  useAdguardStatus,
} from "@/hooks/use-adguard";
import { ICON } from "@/lib/constants";
import {
  clientRowMatches,
  countBySource,
  mergeClientRows,
  type AdguardClientRow,
  type AdguardClientSource,
} from "@/lib/adguard-clients";

type SourceFilter = "all" | AdguardClientSource;

const SOURCE_FILTERS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "configured", label: "Configured" },
  { key: "dhcp", label: "DHCP" },
  { key: "auto", label: "Discovered" },
];

/**
 * Everything AdGuard Home knows about the devices behind it, in one list:
 * configured clients, DHCP leases (when this instance serves DHCP) and
 * auto-discovered clients, each with its query count from the stats
 * window. Read-only in this version; the per-client settings live in the
 * blocked-services work.
 *
 * A pushed route with a FlatList rather than a card on the tab, like the
 * query log: a busy LAN has a hundred rows, and the search field wants the
 * top of the screen.
 */
export default function AdguardClientsScreen() {
  const router = useRouter();
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const [search, setSearch] = useState("");
  const [source, setSource] = useState<SourceFilter>("all");
  const debouncedSearch = useDebouncedValue(search.trim(), 200);

  const clients = useAdguardClients();
  const dhcp = useAdguardDhcpStatus();
  const stats = useAdguardStats();
  const { data: status } = useAdguardStatus();
  const dhcpAvailable = status?.dhcp_available === true;

  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);
  const bottomPadding = useScreenBottomPadding();

  // Sheet → navigation is a modal chain (issue #83), so the sheet is a flow
  // step and the push goes through flow.whenClear.
  const flow = useModalFlow<{ client: AdguardClientRow }>();
  const sheetClient = flow.payload("client") ?? null;

  const rows = useMemo(
    () =>
      mergeClientRows({
        clients: clients.data,
        dhcp: dhcp.data,
        topClients: stats.data?.top_clients,
      }),
    [clients.data, dhcp.data, stats.data?.top_clients],
  );
  const counts = useMemo(() => countBySource(rows), [rows]);

  const visible = useMemo(
    () =>
      rows.filter(
        (r) => (source === "all" || r.source === source) && clientRowMatches(r, debouncedSearch),
      ),
    [rows, source, debouncedSearch],
  );

  const isInitialLoading = clients.isLoading && !clients.data;

  const showQueries = (row: AdguardClientRow) => {
    // AGH's query-log `search` matches the client column too (IP, name or
    // ClientID), so the first id is the most specific filter we can hand it.
    const term = row.ips[0] ?? row.otherIds[0] ?? row.name;
    flow.whenClear(() =>
      router.push({ pathname: "/adguard/queries", params: { search: term } }),
    );
  };

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Clients" />
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-2">{activeName}</Text>
      ) : null}

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Name, IP or MAC"
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="mb-2"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-3"
      >
        {SOURCE_FILTERS.map((f) => {
          // The DHCP chip only makes sense on an instance that serves DHCP.
          if (f.key === "dhcp" && !dhcpAvailable) return null;
          const n = f.key === "all" ? rows.length : counts[f.key];
          return (
            <FilterChip
              key={f.key}
              label={n > 0 ? `${f.label} ${n}` : f.label}
              selected={source === f.key}
              onPress={() => setSource(f.key)}
            />
          );
        })}
      </ScrollView>

      {dhcpAvailable && dhcp.data?.enabled === false ? (
        <Text className="text-zinc-500 text-xs mb-2">
          DHCP server is off on this instance — only configured and discovered clients are listed.
        </Text>
      ) : null}

      <FlatList
        data={visible}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) => (
          <ClientRow row={item} onPress={() => flow.open("client", item)} />
        )}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          isInitialLoading ? (
            <View className="py-8 items-center">
              <Spinner size={18} />
            </View>
          ) : (
            <EmptyState
              icon={<Icon icon={Monitor} size={ICON.XL} color="#71717a" />}
              title={rows.length === 0 ? "No clients yet" : "No matching clients"}
              message={
                rows.length === 0
                  ? "AdGuard Home lists a client once it has answered a query for it, discovered it, or handed it a DHCP lease."
                  : "Nothing matches these filters."
              }
            />
          )
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#3b82f6" />
        }
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews
      />

      <ActionSheet
        {...flow.bind("client")}
        title={sheetClient?.name}
        subtitle={sheetClient ? [...sheetClient.ips, ...sheetClient.macs].join("  ·  ") : undefined}
        actions={
          sheetClient
            ? [
                {
                  label: "Show its queries",
                  subtitle: "Open the query log filtered to this client",
                  icon: <Icon icon={ScrollText} size={ICON.MD} color="#a1a1aa" />,
                  onPress: () => showQueries(sheetClient),
                },
              ]
            : []
        }
      />
    </ScreenWrapper>
  );
}
