import { useMemo, useState } from "react";
import { ScrollView, Switch, Text, View } from "react-native";
import { ShieldBan } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { BlockedServiceIcon } from "@/components/adguard/blocked-service-icon";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { TextInput } from "@/components/ui/text-input";
import { toastError } from "@/components/ui/toast";
import { useActiveInstance } from "@/hooks/use-active-instance";
import { useThemeColor } from "@/hooks/use-theme-color";
import {
  useAdguardBlockedServices,
  useAdguardBlockedServicesAll,
  useToggleAdguardBlockedService,
} from "@/hooks/use-adguard";
import { lightHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";
import {
  blockedServiceMatches,
  describePauseSchedule,
  groupBlockedServices,
} from "@/lib/adguard-blocked-services";

/**
 * AdGuard Home's built-in blocked services: one switch per service, grouped
 * the way the catalog groups them. Switches apply at once (optimistic, see
 * useToggleAdguardBlockedService). The pause schedule is shown but edited
 * in AGH's own UI — it is a seven-day time-range editor, and a toggle that
 * silently does nothing during a pause window is the thing worth
 * explaining here.
 */
export default function AdguardBlockedServicesScreen() {
  const { instances, activeId } = useActiveInstance("adguard");
  const activeName = instances.find((i) => i.id === activeId)?.name;
  const tc = useThemeColor();

  const catalog = useAdguardBlockedServicesAll();
  const current = useAdguardBlockedServices();
  const toggle = useToggleAdguardBlockedService();
  const { refreshing, onRefresh } = usePullToRefresh([["adguard"]]);

  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<string>("all");

  const groups = useMemo(() => groupBlockedServices(catalog.data), [catalog.data]);
  const blockedIds = useMemo(() => new Set(current.data?.ids ?? []), [current.data?.ids]);
  const pause = describePauseSchedule(current.data?.schedule);
  const total = catalog.data?.blocked_services.length ?? 0;

  const visibleGroups = useMemo(
    () =>
      groups
        .filter((g) => group === "all" || g.id === group)
        .map((g) => ({ ...g, services: g.services.filter((s) => blockedServiceMatches(s, search)) }))
        .filter((g) => g.services.length > 0),
    [groups, group, search],
  );

  const flip = (serviceId: string, blocked: boolean) => {
    lightHaptic();
    toggle.mutate(
      { serviceId, blocked },
      { onError: (err) => toastError("Couldn't update blocked services", err) },
    );
  };

  const isInitialLoading = (catalog.isLoading && !catalog.data) || (current.isLoading && !current.data);

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader title="Blocked services" />
      {instances.length > 1 && activeName ? (
        <Text className="text-zinc-500 text-xs -mt-2 mb-2">{activeName}</Text>
      ) : null}

      <View className="flex-row items-baseline gap-2 mb-2">
        <Text className="text-zinc-100 text-base font-semibold">
          {blockedIds.size} of {total} blocked
        </Text>
        {pause ? <Text className="text-zinc-500 text-xs flex-1">{pause}</Text> : null}
      </View>

      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search services"
        autoCapitalize="none"
        autoCorrect={false}
        containerClassName="mb-2"
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        <FilterChip label="All" selected={group === "all"} onPress={() => setGroup("all")} />
        {groups.map((g) => (
          <FilterChip
            key={g.id}
            label={g.label}
            selected={group === g.id}
            onPress={() => setGroup(g.id)}
          />
        ))}
      </ScrollView>

      {isInitialLoading ? (
        <Card>
          <SkeletonCardContent rows={6} />
        </Card>
      ) : catalog.isError ? (
        <EmptyState
          icon={<Icon icon={ShieldBan} size={ICON.XL} color="#71717a" />}
          title="Blocked services unavailable"
          message="This AdGuard Home did not return its services catalog. Update it to a version with /control/blocked_services/all."
        />
      ) : visibleGroups.length === 0 ? (
        <EmptyState compact title="No services match" />
      ) : (
        <View className="gap-4">
          {visibleGroups.map((g) => (
            <Card key={g.id} className="gap-1">
              <Text className="text-zinc-500 text-xs uppercase mb-1">{g.label}</Text>
              {g.services.map((svc) => {
                const blocked = blockedIds.has(svc.id);
                const pending = toggle.isPending && toggle.variables?.serviceId === svc.id;
                return (
                  <View key={svc.id} className="flex-row items-center gap-3 py-2">
                    <BlockedServiceIcon iconB64={svc.icon_svg} size={ICON.MD} color={blocked ? "#ef4444" : "#a1a1aa"} />
                    <Text className="text-zinc-100 text-base flex-1" numberOfLines={1}>
                      {svc.name}
                    </Text>
                    <Switch
                      value={blocked}
                      onValueChange={(v) => flip(svc.id, v)}
                      disabled={pending}
                      trackColor={{ false: tc("#3f3f46"), true: "#ef4444" }}
                      thumbColor={blocked ? "#ffffff" : tc("#a1a1aa")}
                    />
                  </View>
                );
              })}
            </Card>
          ))}
        </View>
      )}
    </ScreenWrapper>
  );
}
