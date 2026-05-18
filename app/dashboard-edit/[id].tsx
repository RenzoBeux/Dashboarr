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
  const initialAttached = useMemo<string[]>(() => {
    if (!dashboard) return [];
    if (dashboard.attachedInstances) return [...dashboard.attachedInstances];
    // Pre-v20 auto-attach mode: seed the draft with every currently-known
    // instance so saving commits the equivalent explicit set.
    const out: string[] = [];
    for (const kind of SERVICE_IDS) {
      for (const inst of serviceInstances[kind] ?? []) {
        out.push(inst.id);
      }
    }
    return out;
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
    Haptics.selectionAsync();
    setAttached((prev) => {
      const has = prev.includes(instanceId);
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
    const ids = (serviceInstances[kind] ?? []).map((i) => i.id);
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
        hint="Pick which service instances belong to this workspace. A second Radarr or qBittorrent on another network can stay quiet on the wrong dashboard."
      >
        {!heavyReady ? (
          <View className="gap-2">
            <View className="h-16 rounded-2xl bg-surface-light/40" />
            <View className="h-16 rounded-2xl bg-surface-light/40" />
          </View>
        ) : (
        <View className="gap-3">
          {SERVICE_IDS.map((kind) => {
            const list = serviceInstances[kind] ?? [];
            if (list.length === 0) return null;
            const multi = list.length > 1;
            const allOn = list.every((inst) => attachedSet.has(inst.id));
            const noneOn = list.every((inst) => !attachedSet.has(inst.id));
            return (
              <View
                key={kind}
                className="rounded-2xl bg-surface-light border border-border/70 overflow-hidden"
              >
                <View className="flex-row items-center gap-2 px-3 py-2.5 border-b border-border/40">
                  <ServiceLogo id={kind} size={16} online />
                  <Text
                    className="flex-1 text-zinc-100 text-sm font-semibold"
                    numberOfLines={1}
                  >
                    {SERVICE_DEFAULTS[kind].name}
                  </Text>
                  {multi && (
                    <View className="flex-row items-center gap-1">
                      <MiniButton
                        label="All"
                        disabled={allOn}
                        onPress={() => handleSelectAll(kind)}
                      />
                      <MiniButton
                        label="None"
                        disabled={noneOn}
                        onPress={() => handleSelectNone(kind)}
                      />
                    </View>
                  )}
                </View>
                {list.map((inst, idx) => {
                  const on = attachedSet.has(inst.id);
                  const isLast = idx === list.length - 1;
                  // For single-instance kinds, fall back to the kind name
                  // so the row doesn't read as a generic placeholder.
                  const label = multi
                    ? inst.name || SERVICE_DEFAULTS[kind].name
                    : SERVICE_DEFAULTS[kind].name;
                  return (
                    <Pressable
                      key={inst.id}
                      onPress={() => handleToggleInstance(inst.id)}
                      className={`flex-row items-center gap-3 px-3 py-3 active:bg-surface ${
                        isLast ? "" : "border-b border-border/30"
                      }`}
                    >
                      <View
                        className="w-5 h-5 rounded items-center justify-center border"
                        style={{
                          backgroundColor: on ? color : "transparent",
                          borderColor: on ? color : "#52525b",
                        }}
                      >
                        {on && (
                          <Icon icon={Check} size={14} color="#ffffff" />
                        )}
                      </View>
                      <Text
                        className={`flex-1 text-sm ${
                          on ? "text-zinc-100 font-medium" : "text-zinc-400"
                        }`}
                        numberOfLines={1}
                      >
                        {label}
                      </Text>
                      {!inst.enabled && (
                        <Text className="text-zinc-600 text-xs">disabled</Text>
                      )}
                    </Pressable>
                  );
                })}
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
