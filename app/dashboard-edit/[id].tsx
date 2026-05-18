import { createElement, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  InteractionManager,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Check, ChevronDown, ChevronUp, Plus, X } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { useConfigStore } from "@/store/config-store";
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

const TAB_LABELS: Record<TabRouteId, string> = {
  downloads: "Downloads",
  calendar: "Calendar",
  services: "Services",
  movies: "Movies",
  tv: "TV",
  requests: "Requests",
  activity: "Activity",
  indexers: "Indexers",
  plex: "Plex",
  jellyfin: "Jellyfin",
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

  const [name, setName] = useState(dashboard?.name ?? "");
  const [icon, setIcon] = useState<string>(
    () => resolveIconName(dashboard?.icon),
  );
  const [color, setColor] = useState<string>(() =>
    resolveDashboardColor(dashboard?.color),
  );
  const [attached, setAttached] = useState<string[]>(initialAttached);
  const [pinned, setPinned] = useState<TabRouteId[]>(() =>
    sanitizePins(dashboard?.pinnedTabs ?? []),
  );

  // Defer mounting the heavy sections (50+ lucide SVGs in the icon picker,
  // the full instances list) until after the stack push transition settles.
  // First paint shows the back header, name field, and color swatches so
  // the screen feels instant; the icon picker and instances list populate
  // a frame later. Without this defer, the route push waits on ~60 SVG
  // mounts before the screen becomes visible, which reads as lag on tap.
  const [heavyReady, setHeavyReady] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setHeavyReady(true);
    });
    return () => handle.cancel();
  }, []);

  // Collapse state for each multi-instance kind card. Default collapsed —
  // the summary line ("2 of 3 attached") gives the user enough at-a-glance
  // info, and keeping kinds folded lets long lists stay scannable. The
  // user expands only the kind they actually want to edit.
  const [expandedKinds, setExpandedKinds] = useState<Record<string, boolean>>({});
  function toggleExpanded(kind: ServiceId) {
    Haptics.selectionAsync();
    setExpandedKinds((prev) => ({ ...prev, [kind]: !prev[kind] }));
  }

  const attachedSet = useMemo(() => new Set(attached), [attached]);
  const attachedKinds = useMemo(() => {
    const out = new Set<ServiceId>();
    for (const kind of SERVICE_IDS) {
      const list = serviceInstances[kind] ?? [];
      if (list.some((inst) => attachedSet.has(inst.id))) out.add(kind);
    }
    return out;
  }, [attachedSet, serviceInstances]);

  const pickable = useMemo(
    () => pickableTabIdsFor(attachedKinds),
    [attachedKinds],
  );

  function handleToggleInstance(instanceId: string) {
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
      // Drop pins whose underlying kind no longer has any attached instance
      // so the pinned list stays consistent with the attachment set.
      const nextKinds = new Set<ServiceId>();
      for (const kind of SERVICE_IDS) {
        const list = serviceInstances[kind] ?? [];
        if (list.some((inst) => next.includes(inst.id))) nextKinds.add(kind);
      }
      const stillPickable = new Set<string>(pickableTabIdsFor(nextKinds));
      setPinned((prevPins) => prevPins.filter((tab) => stillPickable.has(tab)));
      return next;
    });
  }

  function handleSelectAll(kind: ServiceId) {
    Haptics.selectionAsync();
    // Mirror handleToggleInstance: never auto-attach disabled instances.
    // Pre-attached disabled ids stay attached (they were already there).
    const ids = (serviceInstances[kind] ?? [])
      .filter((i) => i.enabled)
      .map((i) => i.id);
    setAttached((prev) => {
      const set = new Set(prev);
      for (const id of ids) set.add(id);
      return [...set];
    });
  }

  function handleSelectNone(kind: ServiceId) {
    Haptics.selectionAsync();
    const remove = new Set((serviceInstances[kind] ?? []).map((i) => i.id));
    setAttached((prev) => prev.filter((id) => !remove.has(id)));
    // Cascading pin cleanup — same logic as handleToggleInstance.
    setPinned((prev) => {
      const nextKinds = new Set<ServiceId>();
      for (const k of SERVICE_IDS) {
        if (k === kind) continue;
        const list = serviceInstances[k] ?? [];
        if (list.some((inst) => attachedSet.has(inst.id))) nextKinds.add(k);
      }
      const stillPickable = new Set<string>(pickableTabIdsFor(nextKinds));
      return prev.filter((tab) => stillPickable.has(tab));
    });
  }

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

  function handleSave() {
    if (!dashboard) {
      router.back();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const trimmed = name.trim();
    if (trimmed.length > 0 && trimmed !== dashboard.name) {
      renameDashboard(dashboard.id, trimmed);
    }
    setDashboardIcon(dashboard.id, icon);
    setDashboardColor(dashboard.id, color);
    setDashboardAttachedInstances(dashboard.id, attached);
    setDashboardPinnedTabs(dashboard.id, pinned);
    toast("Dashboard updated", "success");
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

  return (
    <ScreenWrapper>
      <BackHeader
        title="Edit dashboard"
        right={
          <Pressable
            onPress={handleSave}
            hitSlop={6}
            className="px-4 py-1.5 rounded-xl active:opacity-70"
            style={{ backgroundColor: color }}
          >
            <Text className="text-white text-sm font-semibold">Save</Text>
          </Pressable>
        }
      />

      <Section label="Name">
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Dashboard name"
          maxLength={40}
        />
      </Section>

      <Section label="Icon">
        {heavyReady ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-2 px-0.5 py-1"
          >
            {LUCIDE_ICON_NAMES.map((iconName) => {
              const Comp = LUCIDE_BY_NAME[iconName];
              const selected = icon === iconName;
              return (
                <Pressable
                  key={iconName}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setIcon(iconName);
                  }}
                  hitSlop={4}
                  className={`w-11 h-11 rounded-xl items-center justify-center border ${
                    selected ? "border-2" : "border"
                  }`}
                  style={{
                    backgroundColor: selected ? `${color}26` : "#27272a",
                    borderColor: selected ? color : "#3f3f46",
                  }}
                >
                    {createElement(Comp, {
                      size: 20,
                      color: selected ? color : "#a1a1aa",
                    })}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View className="h-11 rounded-xl bg-surface-light/40" />
        )}
      </Section>

      <Section label="Color">
        <View className="flex-row flex-wrap gap-2">
          {DASHBOARD_COLORS.map((swatch) => {
            const selected = color === swatch.value;
            return (
              <Pressable
                key={swatch.value}
                onPress={() => {
                  Haptics.selectionAsync();
                  setColor(swatch.value);
                }}
                hitSlop={6}
                className={`w-10 h-10 rounded-full items-center justify-center ${
                  selected ? "border-2 border-white" : ""
                }`}
                style={{ backgroundColor: swatch.value }}
              >
                {selected && (
                  <Icon icon={Check} size={ICON.SM} color="#ffffff" />
                )}
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section
        label="Attached instances"
        hint={
          wasAutoAttach
            ? "This dashboard was set to auto-include every service. Tick the instances that belong here — anything you don't tick won't appear on this workspace after you save."
            : "Pick which service instances belong to this workspace. A second Radarr or qBittorrent on another network can stay quiet on the wrong dashboard."
        }
      >
        {!heavyReady ? (
          <View className="gap-2">
            <View className="h-14 rounded-2xl bg-surface-light/40" />
            <View className="h-14 rounded-2xl bg-surface-light/40" />
          </View>
        ) : (
          <View className="gap-2">
            {SERVICE_IDS.map((kind) => {
              const list = serviceInstances[kind] ?? [];
              if (list.length === 0) return null;
              const multi = list.length > 1;
              const enabledCount = list.filter((i) => i.enabled).length;
              const attachedCount = list.filter((i) =>
                attachedSet.has(i.id),
              ).length;
              const allDisabled = enabledCount === 0;
              // Kind-card disabled state: when every instance is disabled
              // and none are currently attached, the whole card is
              // non-interactive — there's nothing meaningful to toggle.
              // (If an instance is attached from a prior state and later
              // got disabled, we still let the user un-attach it.)
              const kindUntouchable = allDisabled && attachedCount === 0;

              // Single-instance kinds render as a flat toggle row — no
              // need for a collapse, the checkbox lives in the header.
              if (!multi) {
                const inst = list[0];
                const on = attachedSet.has(inst.id);
                const interactive = inst.enabled || on;
                return (
                  <Pressable
                    key={kind}
                    onPress={
                      interactive
                        ? () => handleToggleInstance(inst.id)
                        : undefined
                    }
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
                    <Checkbox
                      on={on}
                      color={color}
                      disabled={!interactive}
                    />
                  </Pressable>
                );
              }

              // Multi-instance kinds get a collapsable card with a
              // per-instance breakdown inside.
              const expanded = !!expandedKinds[kind];
              const allOn =
                enabledCount > 0 &&
                list
                  .filter((i) => i.enabled)
                  .every((i) => attachedSet.has(i.id));

              return (
                <View
                  key={kind}
                  className="rounded-2xl bg-surface-light border border-border/70 overflow-hidden"
                >
                  <Pressable
                    onPress={
                      kindUntouchable ? undefined : () => toggleExpanded(kind)
                    }
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
                    <View className="border-t border-border/40">
                      <View className="flex-row items-center gap-1 px-3 py-2 border-b border-border/30">
                        <MiniButton
                          label="All"
                          disabled={allOn || enabledCount === 0}
                          onPress={() => handleSelectAll(kind)}
                        />
                        <MiniButton
                          label="None"
                          disabled={attachedCount === 0}
                          onPress={() => handleSelectNone(kind)}
                        />
                      </View>
                      {list.map((inst, idx) => {
                        const on = attachedSet.has(inst.id);
                        const isLast = idx === list.length - 1;
                        const interactive = inst.enabled || on;
                        const label =
                          inst.name || SERVICE_DEFAULTS[kind].name;
                        return (
                          <Pressable
                            key={inst.id}
                            onPress={
                              interactive
                                ? () => handleToggleInstance(inst.id)
                                : undefined
                            }
                            className={`flex-row items-center gap-3 px-3 py-3 active:bg-surface ${
                              isLast ? "" : "border-b border-border/30"
                            }`}
                            style={{ opacity: !interactive ? 0.5 : 1 }}
                          >
                            <Checkbox
                              on={on}
                              color={color}
                              disabled={!interactive}
                            />
                            <Text
                              className={`flex-1 text-sm ${
                                on
                                  ? "text-zinc-100 font-medium"
                                  : "text-zinc-400"
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
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
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
                <View
                  key={tab}
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
                </View>
              );
            })}

            {(() => {
              const remaining = pickable.filter((t) => !pinned.includes(t));
              if (remaining.length === 0) return null;
              const atMax = pinned.length >= MAX_PINNED_TABS;
              return (
                <View className="flex-row flex-wrap gap-2 mt-1">
                  {remaining.map((tab) => (
                    <Pressable
                      key={tab}
                      onPress={() => handleTogglePin(tab)}
                      hitSlop={4}
                      disabled={atMax}
                      className="flex-row items-center gap-1 rounded-full px-3 py-1.5 border border-border/70 bg-surface-light"
                      style={{ opacity: atMax ? 0.4 : 1 }}
                    >
                      <Icon icon={Plus} size={ICON.SM} color="#a1a1aa" />
                      <Text className="text-zinc-300 text-xs font-medium">
                        {TAB_LABELS[tab]}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              );
            })()}
          </View>
        )}
      </Section>
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

function MiniButton({ label, disabled, onPress }: MiniButtonProps) {
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
}

interface CheckboxProps {
  on: boolean;
  color: string;
  disabled?: boolean;
}

function Checkbox({ on, color, disabled }: CheckboxProps) {
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
}

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
