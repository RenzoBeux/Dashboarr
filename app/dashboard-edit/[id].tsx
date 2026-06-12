import { memo, useCallback, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import { Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
} from "react-native-reanimated";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  Wifi,
  X,
} from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { TextInput } from "@/components/ui/text-input";
import { useConfigStore, type ServiceInstance } from "@/store/config-store";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  ICON,
  SERVICE_DEFAULTS,
  SERVICE_IDS,
  type ServiceId,
} from "@/lib/constants";
import {
  LUCIDE_BY_NAME,
  LUCIDE_ICON_NAMES,
  resolveDashboardIcon,
  type DashboardIconName,
} from "@/lib/dashboard-icons";
import {
  DASHBOARD_COLORS,
  resolveDashboardColor,
} from "@/lib/dashboard-colors";
import {
  ALL_PICKABLE_TABS,
  MAX_PINNED_TABS,
  pickableTabIdsFor,
  type TabRouteId,
} from "@/lib/tab-routes";
import { toast } from "@/components/ui/toast";
import { DashboardIconPickerSheet } from "@/components/dashboard/dashboard-icon-picker-sheet";

const TAB_LABELS: Record<TabRouteId, string> = {
  downloads: "Downloads",
  calendar: "Calendar",
  services: "Services",
  movies: "Movies",
  tv: "TV",
  library: "Library",
  music: "Music",
  requests: "Requests",
  activity: "Activity",
  indexers: "Indexers",
  plex: "Plex",
  jellyfin: "Jellyfin",
  emby: "Emby",
  glances: "Glances",
  bazarr: "Bazarr",
};

export default function DashboardEditScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const dashboard = useConfigStore((s) =>
    s.dashboards.find((d) => d.id === id),
  );
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const renameDashboard = useConfigStore((s) => s.renameDashboard);
  const setDashboardIcon = useConfigStore((s) => s.setDashboardIcon);
  const setDashboardColor = useConfigStore((s) => s.setDashboardColor);
  const setDashboardAttachedInstances = useConfigStore(
    (s) => s.setDashboardAttachedInstances,
  );
  const setDashboardPinnedTabs = useConfigStore(
    (s) => s.setDashboardPinnedTabs,
  );
  const globalHomeNetworks = useConfigStore((s) => s.homeNetworks);
  const setDashboardHomeNetworkIds = useConfigStore(
    (s) => s.setDashboardHomeNetworkIds,
  );

  // Snapshot the dashboard into editable draft state when the screen mounts.
  // If the dashboard is later removed (e.g. via another device through a
  // backend sync), the saved values silently no-op — better than crashing.
  //
  // Auto-attach mode (`attachedInstances === undefined`) starts the draft
  // EMPTY rather than pre-ticking every instance. Users open this screen
  // to curate — pre-ticking everything forces them to untick a long list
  // to reach a focused workspace, which is the opposite of the action they
  // came here to perform. The trade-off (a user who only wanted to tweak
  // icon/color can no longer Save without thinking about attachment) is
  // worth it; that user can hit back/Cancel and the dashboard stays in
  // auto-attach mode.
  const wasAutoAttach = dashboard?.attachedInstances === undefined;
  const initialAttached = useMemo<string[]>(() => {
    if (!dashboard?.attachedInstances) return [];
    return [...dashboard.attachedInstances];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashboard?.id]);

  // Home-network selection draft (#148). undefined = use ALL home networks
  // (and future ones); an array selects a subset of the global list by id.
  // Snapshot on mount, same lifecycle as initialAttached above.
  const initialHomeNetworkIds = useMemo<string[] | undefined>(
    () =>
      dashboard?.homeNetworkIds === undefined
        ? undefined
        : [...dashboard.homeNetworkIds],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard?.id],
  );

  const [name, setName] = useState(dashboard?.name ?? "");
  const [icon, setIcon] = useState<string>(() =>
    resolveIconName(dashboard?.icon),
  );
  const [color, setColor] = useState<string>(() =>
    resolveDashboardColor(dashboard?.color),
  );
  const [attached, setAttached] = useState<string[]>(initialAttached);
  const [touchedAttached, setTouchedAttached] = useState(false);
  const [pinned, setPinned] = useState<TabRouteId[]>(() =>
    sanitizePins(dashboard?.pinnedTabs ?? []),
  );
  const [iconSheetOpen, setIconSheetOpen] = useState(false);

  // Home-network selection editing state. `homeNetworkIdsDraft === undefined`
  // means "All" (use every home network); an array is a custom subset of the
  // global list. Switching to Custom seeds from all current ids so it starts
  // equivalent to All and the user unticks from there.
  const [homeNetworkIdsDraft, setHomeNetworkIdsDraft] = useState<
    string[] | undefined
  >(initialHomeNetworkIds);
  const customHomeNetworks = homeNetworkIdsDraft !== undefined;

  // Track whether the draft diverges from the persisted dashboard so we can
  // (1) skip silent writes on save and (2) prompt before discarding on back.
  const initialName = dashboard?.name ?? "";
  const initialIcon = resolveIconName(dashboard?.icon);
  const initialColor = resolveDashboardColor(dashboard?.color);
  const initialPinned = useMemo(
    () => sanitizePins(dashboard?.pinnedTabs ?? []),
    // Snapshot on mount — same lifecycle as initialAttached, see above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dashboard?.id],
  );
  const trimmedName = name.trim();
  const homeNetworksDirty = !idSelectionsEqual(
    homeNetworkIdsDraft,
    initialHomeNetworkIds,
  );
  const dirty =
    (trimmedName.length > 0 && trimmedName !== initialName) ||
    icon !== initialIcon ||
    color !== initialColor ||
    touchedAttached ||
    !arraysEqual(pinned, initialPinned) ||
    homeNetworksDirty;

  // Intercept back/swipe-dismiss while the draft is dirty so the user gets a
  // chance to keep editing or explicitly discard. Bypass is held in a ref —
  // not state — because Save needs to flip it *and* call router.back() in the
  // same tick; a state flip would re-render after the back call had already
  // tripped the guard.
  const navigation = useNavigation();
  const allowRemoveRef = useRef(false);
  // The discard confirm and the navigation after it go through the flow — see
  // hooks/use-modal-flow.ts. Payload: the navigation action intercepted by
  // usePreventRemove, or null when Cancel was tapped (falls back to
  // router.back()).
  const flow = useModalFlow<{
    discard: Parameters<typeof navigation.dispatch>[0] | null;
  }>();

  usePreventRemove(
    dirty,
    useCallback(({ data }) => {
      if (allowRemoveRef.current) {
        allowRemoveRef.current = false;
        navigation.dispatch(data.action);
        return;
      }
      Haptics.selectionAsync();
      flow.open("discard", data.action);
    }, [navigation, flow]),
  );

  function performDiscard() {
    const action = flow.payload("discard");
    allowRemoveRef.current = true;
    if (action) {
      navigation.dispatch(action);
    } else {
      router.back();
    }
  }

  // Collapse state for each multi-instance kind card. Default collapsed —
  // the summary line ("2 of 3 attached") gives the user enough at-a-glance
  // info, and keeping kinds folded lets long lists stay scannable. The
  // user expands only the kind they actually want to edit.
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({});
  const toggleExpanded = useCallback((kind: ServiceId) => {
    Haptics.selectionAsync();
    setExpandedKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }, []);

  const attachedSet = useMemo(() => new Set(attached), [attached]);
  const attachedKinds = useMemo(() => {
    const out = new Set<ServiceId>();
    for (const kind of SERVICE_IDS) {
      const list = serviceInstances[kind] ?? [];
      if (list.some((inst) => attachedSet.has(inst.id))) out.add(kind);
    }
    return out;
  }, [attachedSet, serviceInstances]);

  // Tabs that may be pinned. For an auto-attach dashboard the user hasn't
  // curated yet, the draft `attached` is intentionally empty — but the live
  // workspace includes every instance, so deriving pickability from the empty
  // draft would offer only "Services" while the real bottom bar is full (#9).
  // Use all enabled kinds in that case; once the user touches attachment, the
  // draft becomes the source of truth.
  const pickableKinds = useMemo(() => {
    if (!wasAutoAttach || touchedAttached) return attachedKinds;
    const out = new Set<ServiceId>();
    for (const kind of SERVICE_IDS) {
      const list = serviceInstances[kind] ?? [];
      if (list.some((inst) => inst.enabled)) out.add(kind);
    }
    return out;
  }, [wasAutoAttach, touchedAttached, attachedKinds, serviceInstances]);

  const pickable = useMemo(
    () => pickableTabIdsFor(pickableKinds),
    [pickableKinds],
  );

  // Recompute the still-pickable tab set from a hypothetical attachment list
  // and prune pins down to it. Centralized so every attachment mutation goes
  // through the same cascade — handleSelectNone in particular used to read
  // the stale `attachedSet` closure, which worked by accident.
  const prunePinsForAttachment = useCallback((nextAttached: string[]) => {
    const nextAttachedSet = new Set(nextAttached);
    const nextKinds = new Set<ServiceId>();
    for (const kind of SERVICE_IDS) {
      const list = serviceInstances[kind] ?? [];
      if (list.some((inst) => nextAttachedSet.has(inst.id))) nextKinds.add(kind);
    }
    const stillPickable = new Set<string>(pickableTabIdsFor(nextKinds));
    setPinned((prevPins) => prevPins.filter((tab) => stillPickable.has(tab)));
  }, [serviceInstances]);

  const handleToggleInstance = useCallback((instanceId: string) => {
    setAttached((prev) => {
      const has = prev.includes(instanceId);
      // Defensive gate: disabled instances can be *removed* (un-attached)
      // but never freshly *added* — there's nothing for the workspace to
      // surface from a disabled instance, and the UI shouldn't be the
      // only thing keeping that invariant.
      if (!has) {
        let live: { enabled: boolean } | undefined;
        for (const kind of SERVICE_IDS) {
          live = (serviceInstances[kind] ?? []).find((i) => i.id === instanceId);
          if (live) break;
        }
        if (live && !live.enabled) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
          return prev;
        }
      }
      Haptics.selectionAsync();
      const next = has
        ? prev.filter((x) => x !== instanceId)
        : [...prev, instanceId];
      prunePinsForAttachment(next);
      setTouchedAttached(true);
      return next;
    });
  }, [serviceInstances, prunePinsForAttachment]);

  const handleSelectAll = useCallback((kind: ServiceId) => {
    Haptics.selectionAsync();
    // Mirror handleToggleInstance: never auto-attach disabled instances.
    // Pre-attached disabled ids stay attached (they were already there).
    const ids = (serviceInstances[kind] ?? [])
      .filter((i) => i.enabled)
      .map((i) => i.id);
    setAttached((prev) => {
      const set = new Set(prev);
      for (const id of ids) set.add(id);
      const next = [...set];
      prunePinsForAttachment(next);
      return next;
    });
    setTouchedAttached(true);
  }, [serviceInstances, prunePinsForAttachment]);

  const handleSelectNone = useCallback((kind: ServiceId) => {
    Haptics.selectionAsync();
    const remove = new Set((serviceInstances[kind] ?? []).map((i) => i.id));
    setAttached((prev) => {
      const next = prev.filter((id) => !remove.has(id));
      prunePinsForAttachment(next);
      return next;
    });
    setTouchedAttached(true);
  }, [serviceInstances, prunePinsForAttachment]);

  function handleTogglePin(tab: TabRouteId) {
    setPinned((prev) => {
      if (prev.includes(tab)) {
        Haptics.selectionAsync();
        return prev.filter((x) => x !== tab);
      }
      if (prev.length >= MAX_PINNED_TABS) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return prev;
      }
      Haptics.selectionAsync();
      return [...prev, tab];
    });
  }

  function handleMovePin(tab: TabRouteId, direction: "up" | "down") {
    setPinned((prev) => {
      const idx = prev.indexOf(tab);
      if (idx === -1) return prev;
      const target = direction === "up" ? idx - 1 : idx + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      Haptics.selectionAsync();
      return next;
    });
  }

  function setHomeNetworksMode(custom: boolean) {
    Haptics.selectionAsync();
    // Custom seeds from all current ids so it starts equivalent to All; the
    // user then unticks. All clears the selection so future networks are
    // included automatically again.
    setHomeNetworkIdsDraft(
      custom ? globalHomeNetworks.map((n) => n.id) : undefined,
    );
  }

  function toggleHomeNetwork(id: string) {
    Haptics.selectionAsync();
    setHomeNetworkIdsDraft((prev) => {
      const cur = prev ?? globalHomeNetworks.map((n) => n.id);
      return cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    });
  }

  function selectAllHomeNetworks() {
    Haptics.selectionAsync();
    setHomeNetworkIdsDraft(globalHomeNetworks.map((n) => n.id));
  }

  function selectNoHomeNetworks() {
    Haptics.selectionAsync();
    setHomeNetworkIdsDraft([]);
  }

  function handleSave() {
    if (!dashboard) {
      router.back();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (trimmedName.length > 0 && trimmedName !== dashboard.name) {
      renameDashboard(dashboard.id, trimmedName);
    }
    if (icon !== initialIcon) setDashboardIcon(dashboard.id, icon);
    if (color !== initialColor) setDashboardColor(dashboard.id, color);
    // Only persist attachment when the user actually touched it. Without this
    // guard, a user opening the editor solely to recolor an auto-attach
    // dashboard (attachedInstances === undefined) would silently demote it
    // to explicit empty attachment — which would then exclude every future
    // instance they add.
    if (touchedAttached) {
      setDashboardAttachedInstances(dashboard.id, attached);
    }
    if (!arraysEqual(pinned, initialPinned)) {
      setDashboardPinnedTabs(dashboard.id, pinned);
    }
    if (homeNetworksDirty) {
      // undefined → use all home networks; an array → custom subset by id.
      setDashboardHomeNetworkIds(dashboard.id, homeNetworkIdsDraft);
    }
    toast("Dashboard updated", "success");
    allowRemoveRef.current = true;
    router.back();
  }

  function handleCancel() {
    if (dirty) {
      Haptics.selectionAsync();
      flow.open("discard", null);
      return;
    }
    allowRemoveRef.current = true;
    router.back();
  }

  if (!dashboard) {
    return (
      <ScreenWrapper>
        <BackHeader title="Edit dashboard" />
        <View className="flex-1 items-center justify-center">
          <Text className="text-zinc-400 text-sm">
            This dashboard no longer exists.
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  const saveTextColor = pickReadableForeground(color);
  const PreviewIcon = LUCIDE_BY_NAME[icon as DashboardIconName] ?? resolveDashboardIcon(icon);
  const previewName = trimmedName.length > 0 ? trimmedName : "Untitled dashboard";
  const previewSummary = (() => {
    const parts: string[] = [];
    if (wasAutoAttach && !touchedAttached) {
      parts.push("Auto-attach all");
    } else if (attached.length === 0) {
      parts.push("No instances");
    } else {
      parts.push(`${attached.length} instance${attached.length === 1 ? "" : "s"}`);
    }
    if (pinned.length > 0) {
      parts.push(`${pinned.length} pinned`);
    }
    return parts.join(" · ");
  })();

  return (
    <ScreenWrapper>
      <BackHeader
        title="Edit dashboard"
        onBack={handleCancel}
        right={
          <Pressable
            onPress={handleSave}
            disabled={!dirty}
            hitSlop={6}
            className="px-4 py-1.5 rounded-xl active:opacity-70"
            style={{ backgroundColor: color, opacity: dirty ? 1 : 0.4 }}
          >
            <Text
              className="text-sm font-semibold"
              style={{ color: saveTextColor }}
            >
              Save
            </Text>
          </Pressable>
        }
      />

      {/* Live preview tile — gives the user immediate visual feedback as they
          edit icon/color/name. Mirrors the row layout used in the dashboards
          picker sheet so they recognise what the result will look like there. */}
      <Animated.View
        layout={LinearTransition.duration(220)}
        className="rounded-2xl p-4 mb-5 border"
        style={{
          backgroundColor: `${color}1A`,
          borderColor: `${color}55`,
        }}
      >
        <View className="flex-row items-center gap-3">
          <View
            className="w-14 h-14 rounded-2xl items-center justify-center"
            style={{ backgroundColor: `${color}33` }}
          >
            <Icon icon={PreviewIcon} size={26} color={color} />
          </View>
          <View className="flex-1">
            <Text
              className="text-zinc-100 text-lg font-bold"
              numberOfLines={1}
            >
              {previewName}
            </Text>
            <Text className="text-zinc-400 text-xs mt-0.5" numberOfLines={1}>
              {previewSummary}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Section label="Name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Dashboard name"
          maxLength={40}
        />
      </Section>

      <Section label="Appearance">
        {/* Icon row opens the full picker on tap. The grid lives in a sheet
            so the edit screen mounts instantly — previously the inline grid
            mounted 60 SVGs synchronously after the route transition, which
            caused the visible pop-in users called "buggy". */}
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setIconSheetOpen(true);
          }}
          className="flex-row items-center gap-3 rounded-2xl bg-surface-light border border-border/70 px-3 py-3 active:bg-surface mb-3"
        >
          <View
            className="w-11 h-11 rounded-xl items-center justify-center"
            style={{ backgroundColor: `${color}26` }}
          >
            <Icon icon={PreviewIcon} size={22} color={color} />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-100 text-sm font-semibold">
              Icon
            </Text>
            <Text className="text-zinc-500 text-xs mt-0.5">
              Tap to pick from {LUCIDE_ICON_NAMES.length} icons
            </Text>
          </View>
          <Icon icon={ChevronRight} size={ICON.MD} color="#71717a" />
        </Pressable>

        <View className="flex-row flex-wrap gap-2">
          {DASHBOARD_COLORS.map((swatch) => (
            <ColorSwatch
              key={swatch.hex}
              hex={swatch.hex}
              selected={color === swatch.hex}
              onPress={() => {
                Haptics.selectionAsync();
                setColor(swatch.hex);
              }}
            />
          ))}
        </View>
      </Section>

      <Section
        label="Attached instances"
        hint={
          wasAutoAttach
            ? "Auto-attach is on — tick what belongs here. Anything left unchecked won't appear on this workspace."
            : "Pick which service instances belong to this workspace."
        }
      >
        <View className="gap-2">
          {SERVICE_IDS.map((kind) => {
            const list = serviceInstances[kind] ?? [];
            if (list.length === 0) return null;
            return (
              <InstanceKindCard
                key={kind}
                kind={kind}
                list={list}
                color={color}
                attachedSet={attachedSet}
                expanded={!!expandedKinds[kind]}
                onToggleExpanded={toggleExpanded}
                onToggleInstance={handleToggleInstance}
                onSelectAll={handleSelectAll}
                onSelectNone={handleSelectNone}
              />
            );
          })}
        </View>
      </Section>

      <Section
        label={`Pinned tabs (${pinned.length}/${MAX_PINNED_TABS})`}
        hint="Pinned tabs appear between Dashboard and Settings in the bottom bar."
      >
        {pickable.length === 0 ? (
          <Text className="text-zinc-500 text-xs">
            Attach at least one service or meta view to pin a tab.
          </Text>
        ) : (
          <View className="gap-1.5">
            {pinned.map((tab, idx) => {
              const isFirst = idx === 0;
              const isLast = idx === pinned.length - 1;
              return (
                <Animated.View
                  key={tab}
                  layout={LinearTransition.duration(200)}
                  entering={FadeIn.duration(180)}
                  exiting={FadeOut.duration(140)}
                  className="flex-row items-center gap-2 rounded-xl border px-3 py-2"
                  style={{
                    borderColor: color,
                    backgroundColor: `${color}1A`,
                  }}
                >
                  <Text className="flex-1 text-zinc-100 text-sm font-medium">
                    {TAB_LABELS[tab]}
                  </Text>
                  <Pressable
                    onPress={() => handleMovePin(tab, "up")}
                    disabled={isFirst}
                    hitSlop={6}
                    className="p-1"
                  >
                    <Icon
                      icon={ChevronUp}
                      size={ICON.MD}
                      color={isFirst ? "#3f3f46" : "#a1a1aa"}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleMovePin(tab, "down")}
                    disabled={isLast}
                    hitSlop={6}
                    className="p-1"
                  >
                    <Icon
                      icon={ChevronDown}
                      size={ICON.MD}
                      color={isLast ? "#3f3f46" : "#a1a1aa"}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() => handleTogglePin(tab)}
                    hitSlop={6}
                    className="p-1"
                  >
                    <Icon icon={X} size={ICON.MD} color="#ef4444" />
                  </Pressable>
                </Animated.View>
              );
            })}

            {(() => {
              const remaining = pickable.filter((t) => !pinned.includes(t));
              if (remaining.length === 0) return null;
              const atMax = pinned.length >= MAX_PINNED_TABS;
              return (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerClassName="gap-2 py-1"
                  className="mt-1 -mx-1 px-1"
                >
                  {remaining.map((tab) => (
                    <Pressable
                      key={tab}
                      onPress={() => handleTogglePin(tab)}
                      hitSlop={4}
                      disabled={atMax}
                      className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border border-border/70 bg-surface-light active:opacity-70"
                      style={{ opacity: atMax ? 0.4 : 1 }}
                    >
                      <Icon icon={Plus} size={ICON.SM} color="#a1a1aa" />
                      <Text className="text-zinc-300 text-xs font-medium">
                        {TAB_LABELS[tab]}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              );
            })()}
          </View>
        )}
      </Section>

      <Section
        label="Home networks"
        hint="Local URLs are used only on a confirmed home WiFi. This workspace uses all your home networks by default — switch to Custom to use only some. Add or edit networks in Settings → Home Networks."
      >
        {globalHomeNetworks.length === 0 ? (
          <Text className="text-zinc-500 text-xs leading-4">
            No home networks yet. Add them in Settings → Home Networks, then
            choose which apply to this workspace here.
          </Text>
        ) : (
          <>
            <View className="flex-row gap-2 mb-3">
              <SegmentButton
                label="All"
                active={!customHomeNetworks}
                color={color}
                onPress={() => setHomeNetworksMode(false)}
              />
              <SegmentButton
                label="Custom"
                active={customHomeNetworks}
                color={color}
                onPress={() => setHomeNetworksMode(true)}
              />
            </View>

            {!customHomeNetworks ? (
              <View className="rounded-2xl bg-surface-light border border-border/70 px-3 py-3 gap-2">
                <Text className="text-zinc-500 text-xs">
                  Using all {globalHomeNetworks.length} home network
                  {globalHomeNetworks.length === 1 ? "" : "s"} (including any you
                  add later).
                </Text>
                {globalHomeNetworks.map((n) => (
                  <View key={n.id} className="flex-row items-center gap-2">
                    <Icon icon={Wifi} size={14} color="#71717a" />
                    <Text
                      className="text-zinc-300 text-sm flex-1"
                      numberOfLines={1}
                    >
                      {n.ssid}
                    </Text>
                    <Text className="text-zinc-600 text-xs">
                      {n.bssid ? "pinned" : "SSID"}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <View className="gap-2">
                <View className="flex-row items-center gap-1 mb-0.5">
                  <MiniButton
                    label="All"
                    disabled={
                      (homeNetworkIdsDraft ?? []).length ===
                      globalHomeNetworks.length
                    }
                    onPress={selectAllHomeNetworks}
                  />
                  <MiniButton
                    label="None"
                    disabled={(homeNetworkIdsDraft ?? []).length === 0}
                    onPress={selectNoHomeNetworks}
                  />
                </View>
                {globalHomeNetworks.map((n) => {
                  const on = (homeNetworkIdsDraft ?? []).includes(n.id);
                  return (
                    <Pressable
                      key={n.id}
                      onPress={() => toggleHomeNetwork(n.id)}
                      className="flex-row items-center gap-3 rounded-2xl bg-surface-light border border-border/70 px-3 py-3 active:bg-surface"
                    >
                      <Checkbox on={on} color={color} />
                      <View className="flex-1">
                        <Text
                          className={`text-sm ${on ? "text-zinc-100 font-medium" : "text-zinc-400"}`}
                          numberOfLines={1}
                        >
                          {n.ssid}
                        </Text>
                        <Text className="text-zinc-500 text-xs">
                          {n.bssid ? `Pinned to ${n.bssid}` : "SSID-only match"}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
                {(homeNetworkIdsDraft ?? []).length === 0 && (
                  <Text className="text-amber-500/80 text-xs leading-4">
                    No networks selected — this workspace will use remote URLs
                    everywhere.
                  </Text>
                )}
              </View>
            )}
          </>
        )}
      </Section>

      <ConfirmModal
        {...flow.bind("discard")}
        title="Discard changes?"
        message="Your edits to this dashboard haven't been saved yet."
        tone="danger"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          flow.close();
          flow.whenClear(performDiscard);
        }}
      />

      <DashboardIconPickerSheet
        visible={iconSheetOpen}
        onClose={() => setIconSheetOpen(false)}
        selected={icon}
        color={color}
        onSelect={(picked) => setIcon(picked)}
      />
    </ScreenWrapper>
  );
}

interface SectionProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

function Section({ label, hint, children }: SectionProps) {
  return (
    <View className="mb-5">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
        {label}
      </Text>
      {hint && (
        <Text className="text-zinc-500 text-xs mb-3 leading-4">{hint}</Text>
      )}
      {children}
    </View>
  );
}

interface MiniButtonProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

const MiniButton = memo(function MiniButton({ label, disabled, onPress }: MiniButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      className="rounded-md px-2 py-1 bg-surface border border-border/70 active:opacity-70"
      style={{ opacity: disabled ? 0.4 : 1 }}
    >
      <Text className="text-zinc-300 text-[0.7rem] font-medium">{label}</Text>
    </Pressable>
  );
});

interface SegmentButtonProps {
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}

const SegmentButton = memo(function SegmentButton({
  label,
  active,
  color,
  onPress,
}: SegmentButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-1 rounded-xl py-2.5 items-center border active:opacity-80"
      style={{
        backgroundColor: active ? `${color}1A` : "transparent",
        borderColor: active ? color : "#3f3f46",
      }}
    >
      <Text
        className="text-sm font-semibold"
        style={{ color: active ? color : "#a1a1aa" }}
      >
        {label}
      </Text>
    </Pressable>
  );
});

interface CheckboxProps {
  on: boolean;
  color: string;
  disabled?: boolean;
}

const Checkbox = memo(function Checkbox({ on, color, disabled }: CheckboxProps) {
  return (
    <View
      className="w-5 h-5 rounded items-center justify-center border"
      style={{
        backgroundColor: on ? color : "transparent",
        borderColor: on ? color : disabled ? "#3f3f46" : "#52525b",
      }}
    >
      {on && <Icon icon={Check} size={14} color="#ffffff" />}
    </View>
  );
});

interface ColorSwatchProps {
  hex: string;
  selected: boolean;
  onPress: () => void;
}

const ColorSwatch = memo(function ColorSwatch({ hex, selected, onPress }: ColorSwatchProps) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      className={`w-10 h-10 rounded-full items-center justify-center ${
        selected ? "border-2 border-white" : ""
      }`}
      style={{ backgroundColor: hex }}
    >
      {selected && <Icon icon={Check} size={ICON.SM} color="#ffffff" />}
    </Pressable>
  );
});

interface InstanceKindCardProps {
  kind: ServiceId;
  list: readonly ServiceInstance[];
  color: string;
  attachedSet: Set<string>;
  expanded: boolean;
  onToggleExpanded: (kind: ServiceId) => void;
  onToggleInstance: (id: string) => void;
  onSelectAll: (kind: ServiceId) => void;
  onSelectNone: (kind: ServiceId) => void;
}

const InstanceKindCard = memo(function InstanceKindCard({
  kind,
  list,
  color,
  attachedSet,
  expanded,
  onToggleExpanded,
  onToggleInstance,
  onSelectAll,
  onSelectNone,
}: InstanceKindCardProps) {
  const multi = list.length > 1;
  const enabledCount = list.filter((i) => i.enabled).length;
  const attachedCount = list.filter((i) => attachedSet.has(i.id)).length;
  const allDisabled = enabledCount === 0;
  // Kind-card disabled state: when every instance is disabled and none are
  // currently attached, the whole card is non-interactive — there's nothing
  // meaningful to toggle. (If an instance is attached from a prior state and
  // later got disabled, we still let the user un-attach it.)
  const kindUntouchable = allDisabled && attachedCount === 0;

  // Single-instance kinds render as a flat toggle row — no need for a
  // collapse, the checkbox lives in the header.
  if (!multi) {
    const inst = list[0];
    const on = attachedSet.has(inst.id);
    const interactive = inst.enabled || on;
    return (
      <Pressable
        onPress={interactive ? () => onToggleInstance(inst.id) : undefined}
        className="flex-row items-center gap-3 rounded-2xl bg-surface-light border border-border/70 px-3 py-3 active:bg-surface"
        style={{ opacity: !interactive ? 0.5 : 1 }}
      >
        <ServiceLogo id={kind} size={16} online />
        <View className="flex-1">
          <Text
            className="text-zinc-100 text-sm font-semibold"
            numberOfLines={1}
          >
            {SERVICE_DEFAULTS[kind].name}
          </Text>
          {!inst.enabled && (
            <Text className="text-zinc-600 text-xs mt-0.5">
              Enable in Settings to attach
            </Text>
          )}
        </View>
        <Checkbox on={on} color={color} disabled={!interactive} />
      </Pressable>
    );
  }

  // Multi-instance kinds get a collapsable card with a per-instance breakdown.
  const allOn =
    enabledCount > 0 &&
    list.filter((i) => i.enabled).every((i) => attachedSet.has(i.id));

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      className="rounded-2xl bg-surface-light border border-border/70 overflow-hidden"
    >
      <Pressable
        onPress={kindUntouchable ? undefined : () => onToggleExpanded(kind)}
        className="flex-row items-center gap-3 px-3 py-3 active:bg-surface"
        style={{ opacity: kindUntouchable ? 0.55 : 1 }}
      >
        <ServiceLogo id={kind} size={16} online />
        <View className="flex-1">
          <Text
            className="text-zinc-100 text-sm font-semibold"
            numberOfLines={1}
          >
            {SERVICE_DEFAULTS[kind].name}
          </Text>
          <Text
            className="text-zinc-500 text-xs mt-0.5"
            numberOfLines={1}
          >
            {kindUntouchable
              ? "All instances disabled — enable in Settings"
              : `${attachedCount} of ${list.length} attached`}
          </Text>
        </View>
        {!kindUntouchable && (
          <Icon
            icon={expanded ? ChevronUp : ChevronDown}
            size={18}
            color="#a1a1aa"
          />
        )}
      </Pressable>

      {expanded && !kindUntouchable && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(140)}
          className="border-t border-border/40"
        >
          <View className="flex-row items-center gap-1 px-3 py-2 border-b border-border/30">
            <MiniButton
              label="All"
              disabled={allOn || enabledCount === 0}
              onPress={() => onSelectAll(kind)}
            />
            <MiniButton
              label="None"
              disabled={attachedCount === 0}
              onPress={() => onSelectNone(kind)}
            />
          </View>
          {list.map((inst, idx) => {
            const on = attachedSet.has(inst.id);
            const isLast = idx === list.length - 1;
            const interactive = inst.enabled || on;
            const label = inst.name || SERVICE_DEFAULTS[kind].name;
            return (
              <Pressable
                key={inst.id}
                onPress={interactive ? () => onToggleInstance(inst.id) : undefined}
                className={`flex-row items-center gap-3 px-3 py-3 active:bg-surface ${
                  isLast ? "" : "border-b border-border/30"
                }`}
                style={{ opacity: !interactive ? 0.5 : 1 }}
              >
                <Checkbox on={on} color={color} disabled={!interactive} />
                <Text
                  className={`flex-1 text-sm ${
                    on ? "text-zinc-100 font-medium" : "text-zinc-400"
                  }`}
                  numberOfLines={1}
                >
                  {label}
                </Text>
                {!inst.enabled && (
                  <Text className="text-zinc-600 text-xs">
                    disabled
                  </Text>
                )}
              </Pressable>
            );
          })}
        </Animated.View>
      )}
    </Animated.View>
  );
});

function resolveIconName(name: string | undefined): DashboardIconName {
  if (name && name in LUCIDE_BY_NAME) return name as DashboardIconName;
  return LUCIDE_ICON_NAMES[0];
}

function sanitizePins(pins: readonly string[]): TabRouteId[] {
  const valid = new Set<string>(ALL_PICKABLE_TABS);
  const out: TabRouteId[] = [];
  const seen = new Set<string>();
  for (const p of pins) {
    if (!valid.has(p)) continue;
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p as TabRouteId);
    if (out.length >= MAX_PINNED_TABS) break;
  }
  return out;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

// Compare two home-network selections. `undefined` (All) is distinct from `[]`
// (Custom with nothing selected) — toggling between them is a real change — so a
// strict undefined check comes before the order-independent set compare.
function idSelectionsEqual(
  a: string[] | undefined,
  b: string[] | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  for (const id of a) if (!setB.has(id)) return false;
  return true;
}

// Pick black-or-white text for a hex background using sRGB relative luminance.
// The Save pill paints the dashboard color full-bleed; amber/slate/yellow
// swatches are bright enough that white text loses contrast — flip to black
// in those cases. Threshold of 0.55 keeps blue/red/purple on white text and
// flips amber/slate to dark.
function pickReadableForeground(hex: string): string {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return "#ffffff";
  const int = parseInt(m[1], 16);
  const r = ((int >> 16) & 0xff) / 255;
  const g = ((int >> 8) & 0xff) / 255;
  const b = (int & 0xff) / 255;
  const lin = (c: number) =>
    c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.55 ? "#0a0a0a" : "#ffffff";
}
