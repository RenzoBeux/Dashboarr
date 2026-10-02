import { useMemo, useState } from "react";
import { FlatList, RefreshControl, ScrollView, Text, View } from "react-native";
import { Ban, Search, ShieldCheck, Undo2 } from "lucide-react-native";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { QueryRow } from "@/components/adguard/query-row";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { toast, toastError } from "@/components/ui/toast";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  useAdguardDomainRule,
  useAdguardDomainRuleEverywhere,
  useAdguardFilterStatus,
  useAdguardLiveQueryLog,
  useAdguardQueryLog,
} from "@/hooks/use-adguard";
import { classifyQueryReason } from "@/lib/adguard-normalize";
import {
  allowRuleFor,
  blockRuleFor,
  domainRuleState,
  normalizeRuleDomain,
  userRulesOf,
  type AdguardDomainRuleChange,
} from "@/lib/adguard-rules";
import { ICON } from "@/lib/constants";
import type { AdguardQueryLogFilters, AdguardQueryLogItem } from "@/lib/types";

type Verdict = "all" | "blocked" | "rewritten" | "allowed";

const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "all", label: "All" },
  { key: "blocked", label: "Blocked" },
  { key: "rewritten", label: "Rewritten" },
  { key: "allowed", label: "Allowed" },
];

interface RuleIntent {
  domain: string;
  change: AdguardDomainRuleChange;
}

const CHANGE_VERB: Record<AdguardDomainRuleChange, string> = {
  allow: "allowed",
  block: "blocked",
  clear: "reset",
};

/**
 * The live DNS query log.
 *
 * A pushed route rather than a card on the AdGuard Home tab, for three
 * reasons: ScreenWrapper is a KeyboardAwareScrollView, so a hundred rows
 * nested inside it would render unwindowed; the live poll should only run
 * while someone is looking at it, and a pushed route unmounts on back; and
 * the search field wants to own the top of a screen. Mirrors
 * app/(tabs)/(pihole)/pihole/queries.tsx.
 */
export default function AdguardQueriesScreen() {
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;

  const [verdict, setVerdict] = useState<Verdict>("all");
  const [search, setSearch] = useState("");
  const [atTop, setAtTop] = useState(true);

  // Sheet → confirm is a modal chain, so it goes through useModalFlow (the
  // iOS dismiss race, issue #83). The sheet's payload is the tapped row; the
  // confirm's is what the user chose to do with its domain.
  const flow = useModalFlow<{ query: AdguardQueryLogItem; confirmRule: RuleIntent }>();
  const sheetQuery = flow.payload("query") ?? null;
  const intent = flow.payload("confirmRule") ?? null;

  // Custom-rule actions. The cached filter status is good enough to decide
  // which actions to OFFER (allow vs. "remove allow rule"); the write itself
  // re-reads the list — see useAdguardDomainRule.
  const { data: filterStatus } = useAdguardFilterStatus();
  const allInstances = useEnabledInstances("adguard");
  const multiInstance = allInstances.length > 1;
  const [everywhere, setEverywhere] = useState(false);
  const domainRule = useAdguardDomainRule();
  const domainRuleEverywhere = useAdguardDomainRuleEverywhere();
  const ruleBusy = domainRule.isPending || domainRuleEverywhere.isPending;

  const debouncedSearch = useDebouncedValue(search.trim(), 400);

  const filters: AdguardQueryLogFilters = useMemo(
    () => ({ search: debouncedSearch || undefined }),
    [debouncedSearch],
  );

  // Live only while the list is at the top: refetching an infinite query
  // re-fetches EVERY loaded page, so polling once the user has scrolled would
  // replace the content under their finger.
  const live = atTop;
  const liveQuery = useAdguardLiveQueryLog(filters, live);
  const log = useAdguardQueryLog(filters);

  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);
  const bottomPadding = useScreenBottomPadding();

  const rawRows: AdguardQueryLogItem[] = live
    ? (liveQuery.data?.data ?? [])
    : (log.data?.pages.flatMap((p) => p.data) ?? []);

  // AGH's `reason` filter accepts multiple FilteringReason values (repeated
  // `reason=` params — see queryLogParams), but the verdict chips here are a
  // coarse umbrella over several reasons each, so filtering stays
  // client-side on the loaded page. The caption below says so rather than
  // letting the counts be misread as server-wide.
  const rows = useMemo(() => {
    if (verdict === "all") return rawRows;
    return rawRows.filter((q) => classifyQueryReason(q.reason) === verdict);
  }, [rawRows, verdict]);

  const isInitialLoading = live
    ? liveQuery.isLoading && !liveQuery.data
    : log.isLoading && !log.data;

  const loadMore = () => {
    if (live) return;
    if (!log.hasNextPage || log.isFetchingNextPage) return;
    void log.fetchNextPage();
  };

  const sheetActions = useMemo((): ActionSheetAction[] => {
    if (!sheetQuery) return [];
    const openRuleConfirm = (domain: string, change: AdguardDomainRuleChange) => {
      setEverywhere(false);
      flow.open("confirmRule", { domain, change });
    };
    const actions: ActionSheetAction[] = [
      {
        label: "Filter by this domain",
        icon: <Icon icon={Search} size={ICON.MD} color="#a1a1aa" />,
        onPress: () => setSearch(sheetQuery.question.name),
      },
    ];
    const domain = normalizeRuleDomain(sheetQuery.question.name);
    if (!domain) return actions;
    const state = domainRuleState(userRulesOf(filterStatus), domain);
    if (state.allow.length > 0 || state.block.length > 0) {
      actions.push({
        label: state.allow.length > 0 ? "Remove allow rule" : "Remove block rule",
        subtitle: [...state.allow, ...state.block].join("  ·  "),
        icon: <Icon icon={Undo2} size={ICON.MD} color="#a1a1aa" />,
        onPress: () => openRuleConfirm(domain, "clear"),
      });
    }
    if (state.allow.length === 0) {
      actions.push({
        label: "Allow domain",
        subtitle: allowRuleFor(domain),
        icon: <Icon icon={ShieldCheck} size={ICON.MD} color="#22c55e" />,
        onPress: () => openRuleConfirm(domain, "allow"),
      });
    }
    if (state.block.length === 0) {
      actions.push({
        label: "Block domain",
        subtitle: blockRuleFor(domain),
        icon: <Icon icon={Ban} size={ICON.MD} color="#ef4444" />,
        variant: "danger",
        onPress: () => openRuleConfirm(domain, "block"),
      });
    }
    return actions;
  }, [sheetQuery, filterStatus, flow]);

  const runRule = () => {
    if (!intent) return;
    flow.close();
    const { domain, change } = intent;
    const verb = CHANGE_VERB[change];
    if (everywhere && multiInstance) {
      domainRuleEverywhere.mutate(
        { domain, change },
        {
          onSuccess: (result) => {
            if (result.failed.length === 0) {
              toast(`${domain} ${verb} on ${result.ok.length} AdGuard Home instances`);
              return;
            }
            const names = result.failed.map((f) => f.instance.name).join(", ");
            toastError(
              result.ok.length > 0
                ? `${verb[0]!.toUpperCase()}${verb.slice(1)} on ${result.ok.length}, failed on ${names}`
                : `Failed on ${names}`,
              result.failed[0]!.error,
            );
          },
          onError: (err) => toastError("Couldn't update rules", err),
        },
      );
      return;
    }
    domainRule.mutate(
      { domain, change },
      {
        onSuccess: (edit) =>
          toast(
            change === "clear"
              ? edit.changed
                ? `Removed ${edit.removed.length} rule${edit.removed.length === 1 ? "" : "s"} for ${domain}`
                : `No custom rule for ${domain}`
              : `${domain} ${verb}`,
          ),
        onError: (err) => toastError("Couldn't update rules", err),
      },
    );
  };

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Query Log" />
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-2">{activeName}</Text>
      ) : null}

      {/* Above the list, so the keyboard can never cover it. */}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search"
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
        {VERDICTS.map((v) => (
          <FilterChip
            key={v.key}
            label={v.label}
            selected={verdict === v.key}
            onPress={() => setVerdict(v.key)}
          />
        ))}
      </ScrollView>

      <View className="flex-row items-center gap-2 mb-2">
        <View
          className={`w-1.5 h-1.5 rounded-full ${live ? "bg-success" : "bg-zinc-600"}`}
        />
        <Text className="text-zinc-500 text-xs">
          {live ? "Live" : "Paused — scroll to the top to resume"}
        </Text>
        {verdict !== "all" ? (
          <Text className="text-zinc-600 text-xs">
            · {rows.length} of {rawRows.length} loaded
          </Text>
        ) : null}
      </View>

      <FlatList
        data={rows}
        keyExtractor={(q) => `${q.time}-${q.question.name}`}
        renderItem={({ item }) => (
          <QueryRow query={item} onPress={() => flow.open("query", item)} />
        )}
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          isInitialLoading ? null : (
            <EmptyState
              title="No queries"
              message={
                debouncedSearch || verdict !== "all"
                  ? "Nothing matches these filters."
                  : "AdGuard Home has not logged any queries yet."
              }
            />
          )
        }
        ListFooterComponent={
          log.isFetchingNextPage ? (
            <View className="py-4 items-center">
              <Spinner size={18} />
            </View>
          ) : null
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        onScroll={(e) => setAtTop(e.nativeEvent.contentOffset.y < 40)}
        scrollEventThrottle={200}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
          />
        }
        contentContainerStyle={{ paddingBottom: bottomPadding }}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        windowSize={7}
        removeClippedSubviews
      />

      <ActionSheet
        {...flow.bind("query")}
        title={sheetQuery?.question.name}
        subtitle={sheetQuery?.client_info?.name || sheetQuery?.client}
        actions={sheetActions}
      />

      <ConfirmModal
        {...flow.bind("confirmRule")}
        title={
          intent?.change === "allow"
            ? "Allow domain"
            : intent?.change === "block"
              ? "Block domain"
              : "Remove custom rule"
        }
        icon={intent?.change === "allow" ? ShieldCheck : intent?.change === "block" ? Ban : Undo2}
        tone={intent?.change === "block" ? "danger" : "default"}
        confirmLabel={
          intent?.change === "allow" ? "Allow" : intent?.change === "block" ? "Block" : "Remove"
        }
        message={
          intent ? (
            <View className="gap-3">
              <Text className="text-zinc-400 text-sm">
                {intent.change === "clear"
                  ? `Remove every custom rule for ${intent.domain}. Filter lists decide again from the next query on.`
                  : intent.change === "allow"
                    ? `Adds a custom rule so ${intent.domain} and its subdomains are never blocked, even by a filter list.`
                    : `Adds a custom rule that blocks ${intent.domain} and its subdomains for every client.`}
              </Text>
              {intent.change !== "clear" ? (
                <Text className="text-zinc-300 text-sm font-mono">
                  {intent.change === "allow" ? allowRuleFor(intent.domain) : blockRuleFor(intent.domain)}
                </Text>
              ) : null}
              {multiInstance ? (
                <Toggle
                  label={`Apply to all ${allInstances.length} AdGuard Home instances`}
                  description="Otherwise only the instance shown above changes."
                  value={everywhere}
                  onValueChange={setEverywhere}
                  disabled={ruleBusy}
                />
              ) : null}
            </View>
          ) : (
            ""
          )
        }
        onConfirm={runRule}
      />
    </ScreenWrapper>
  );
}
