import { createElement, useEffect, useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
} from "react-native";
import { Check, X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useBottomInset } from "@/hooks/use-bottom-inset";
import * as Haptics from "expo-haptics";
import { useConfigStore } from "@/store/config-store";
import { ICON } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { GlassSurface } from "@/components/ui/glass-surface";
import { resolveDashboardIcon } from "@/lib/dashboard-icons";
import { resolveDashboardColor } from "@/lib/dashboard-colors";
import { useModalClosed } from "@/hooks/use-modal-closed";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface AddToDashboardsSheetProps {
  visible: boolean;
  instanceId: string;
  instanceName: string;
  onClose: () => void;
  /**
   * Fired once the sheet's native Modal is fully gone (see `useModalClosed`).
   * Lets the caller sequence what follows the dismissal (e.g. unmounting the
   * editor screen behind it) — wired by `useModalFlow`.
   */
  onClosed?: () => void;
}

type RowState =
  | { kind: "auto" }
  | { kind: "attached" }
  | { kind: "candidate" };

export function AddToDashboardsSheet({
  visible,
  instanceId,
  instanceName,
  onClose,
  onClosed,
}: AddToDashboardsSheetProps) {
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeDashboardId = useConfigStore((s) => s.activeDashboardId);
  const setDashboardAttachedInstances = useConfigStore(
    (s) => s.setDashboardAttachedInstances,
  );
  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const bottomInset = useBottomInset();

  const [mounted, setMounted] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Fire onClosed once the native Modal is fully gone — the safe point to
  // unmount the screen behind / present another modal on iOS.
  const handleDismiss = useModalClosed(mounted, onClosed);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  // Classify each dashboard's relationship to this instance. Auto-attach mode
  // already includes every instance, so those rows are informational only.
  // Already-attached curated rows are also informational. Curated rows that
  // don't include the instance are the actionable candidates.
  const rows = useMemo(() => {
    return dashboards.map((d) => {
      let state: RowState;
      if (d.attachedInstances === undefined) {
        state = { kind: "auto" };
      } else if (d.attachedInstances.includes(instanceId)) {
        state = { kind: "attached" };
      } else {
        state = { kind: "candidate" };
      }
      return { dashboard: d, state };
    });
  }, [dashboards, instanceId]);

  // Default-check the active workspace when it's a candidate. Other candidates
  // are opt-in: the user just configured the instance and almost certainly
  // wants it visible on the dashboard they're currently on, but not necessarily
  // on every other workspace they may have curated for a different purpose.
  useEffect(() => {
    if (!visible) return;
    const initial = new Set<string>();
    for (const r of rows) {
      if (r.state.kind === "candidate" && r.dashboard.id === activeDashboardId) {
        initial.add(r.dashboard.id);
      }
    }
    setSelected(initial);
  }, [visible, rows, activeDashboardId]);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, {
        damping: 22,
        stiffness: 190,
        mass: 0.9,
      });
      backdrop.value = withTiming(1, { duration: 200 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 240, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
      // If the exit timing is cancelled (a gesture wrote translateY mid-close,
      // so `finished` never comes), force the unmount anyway — a stuck
      // `mounted` leaves an invisible Modal eating touches and never delivers
      // onClosed. Cleared when the sheet reopens before it fires.
      const force = setTimeout(() => setMounted(false), 350);
      return () => clearTimeout(force);
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const handlePan = Gesture.Pan()
    // Disabled while closing: a pan landing mid-close would cancel the exit
    // withTiming and strand `mounted` true (see the matching guard in
    // components/ui/action-sheet.tsx).
    .enabled(visible)
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 200 });
      }
    });

  function toggle(dashboardId: string) {
    Haptics.selectionAsync();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(dashboardId)) {
        next.delete(dashboardId);
      } else {
        next.add(dashboardId);
      }
      return next;
    });
  }

  function handleAdd() {
    if (selected.size === 0) {
      onClose();
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    let applied = 0;
    for (const r of rows) {
      if (r.state.kind !== "candidate") continue;
      if (!selected.has(r.dashboard.id)) continue;
      const current = r.dashboard.attachedInstances ?? [];
      setDashboardAttachedInstances(r.dashboard.id, [...current, instanceId]);
      applied++;
    }
    if (applied > 0) {
      toast(
        applied === 1
          ? `${instanceName} attached to 1 dashboard`
          : `${instanceName} attached to ${applied} dashboards`,
        "success",
      );
    }
    onClose();
  }

  const candidateCount = rows.filter((r) => r.state.kind === "candidate").length;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable onPress={onClose} className="flex-1 bg-black/70" />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyle,
              {
                maxHeight: SHEET_MAX_HEIGHT,
                paddingBottom: bottomInset + 8,
                overflow: "hidden",
              },
            ]}
            className="rounded-t-3xl border-t border-border"
          >
            <GlassSurface
              style={StyleSheet.absoluteFill}
              fallbackClassName="bg-surface"
            />
            <GestureDetector gesture={handlePan}>
              <View className="pt-3 pb-1">
                <View className="self-center w-10 h-1 rounded-full bg-zinc-700" />

                <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-zinc-100 text-xl font-bold">
                      Add to dashboards
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      {candidateCount > 0
                        ? `Choose which dashboards should include ${instanceName}.`
                        : `${instanceName} is already part of every dashboard.`}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                  >
                    <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="px-4 pt-1 pb-4"
              showsVerticalScrollIndicator={false}
            >
              <View className="gap-2">
                {rows.map(({ dashboard: d, state }) => {
                  const rowIcon = resolveDashboardIcon(d.icon);
                  const rowColor = resolveDashboardColor(d.color);
                  const isCandidate = state.kind === "candidate";
                  const isChecked = selected.has(d.id);
                  const statusLabel =
                    state.kind === "auto"
                      ? "Already in this workspace (auto)"
                      : state.kind === "attached"
                        ? "Already in this workspace"
                        : isChecked
                          ? "Will be added"
                          : "Not in this workspace";

                  return (
                    <Pressable
                      key={d.id}
                      onPress={isCandidate ? () => toggle(d.id) : undefined}
                      disabled={!isCandidate}
                      className={`rounded-2xl border px-3 py-3 active:opacity-80 ${
                        isCandidate && isChecked
                          ? "border-primary/40"
                          : "bg-surface-light border-border/70"
                      }`}
                      style={
                        isCandidate && isChecked
                          ? { backgroundColor: `${rowColor}1A` }
                          : !isCandidate
                            ? { opacity: 0.6 }
                            : undefined
                      }
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="w-10 h-10 rounded-xl items-center justify-center"
                          style={{ backgroundColor: `${rowColor}26` }}
                        >
                          {createElement(rowIcon, { size: 20, color: rowColor })}
                        </View>
                        <View className="flex-1">
                          <Text
                            className="text-zinc-100 text-base font-semibold"
                            numberOfLines={1}
                          >
                            {d.name}
                          </Text>
                          <Text
                            className="text-zinc-500 text-xs mt-0.5"
                            numberOfLines={1}
                          >
                            {statusLabel}
                          </Text>
                        </View>
                        {isCandidate ? (
                          <View
                            className={`w-6 h-6 rounded-md border items-center justify-center ${
                              isChecked
                                ? "border-primary bg-primary/20"
                                : "border-zinc-600"
                            }`}
                          >
                            {isChecked ? (
                              <Icon
                                icon={Check}
                                size={ICON.SM}
                                color={rowColor}
                              />
                            ) : null}
                          </View>
                        ) : (
                          <Icon icon={Check} size={ICON.SM} color="#52525b" />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
              </View>

              <Text className="text-zinc-600 text-xs mt-4 px-1">
                Widgets are added separately. Open a dashboard and tap “Add
                widget” to put this service’s card on it.
              </Text>
            </ScrollView>

            <View className="flex-row gap-3 px-4 pt-2 pb-1">
              {candidateCount === 0 ? (
                <Button label="Got it" onPress={onClose} className="flex-1" />
              ) : (
                <>
                  <Button
                    label="Skip"
                    variant="outline"
                    onPress={onClose}
                    className="flex-1"
                  />
                  <Button
                    label={selected.size > 0 ? `Add (${selected.size})` : "Add"}
                    onPress={handleAdd}
                    disabled={selected.size === 0}
                    className="flex-1"
                  />
                </>
              )}
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * True when there is at least one curated dashboard that does not yet include
 * the given instance UUID. Auto-attach dashboards already include every
 * instance implicitly, so they don't count as candidates for the prompt.
 */
export function hasDashboardCandidatesForInstance(
  dashboards: { attachedInstances?: string[] }[],
  instanceId: string,
): boolean {
  return dashboards.some(
    (d) =>
      Array.isArray(d.attachedInstances) &&
      !d.attachedInstances.includes(instanceId),
  );
}
