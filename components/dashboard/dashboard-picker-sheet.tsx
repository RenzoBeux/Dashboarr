import { createElement, useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
  TextInput,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Check,
  ChevronUp,
  ChevronDown,
  Plus,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react-native";
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
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useConfigStore } from "@/store/config-store";
import { ICON } from "@/lib/constants";
import type { Dashboard } from "@/store/config-store";
import { GlassSurface } from "@/components/ui/glass-surface";
import { resolveDashboardIcon } from "@/lib/dashboard-icons";
import { resolveDashboardColor } from "@/lib/dashboard-colors";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface DashboardPickerSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function DashboardPickerSheet({ visible, onClose }: DashboardPickerSheetProps) {
  const dashboards = useConfigStore((s) => s.dashboards);
  const activeDashboardId = useConfigStore((s) => s.activeDashboardId);
  const addDashboard = useConfigStore((s) => s.addDashboard);
  const removeDashboard = useConfigStore((s) => s.removeDashboard);
  const setActiveDashboard = useConfigStore((s) => s.setActiveDashboard);
  const moveDashboard = useConfigStore((s) => s.moveDashboard);
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const [pendingRemove, setPendingRemove] = useState<Dashboard | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  // Submit-only commit (via the keyboard return key or the inline check
  // button). Tapping the backdrop, an existing dashboard, or the close button
  // discards the draft — `onBlur`-commit was surprising because it conflated
  // "I lost focus" with "I'm done", and users who tapped the backdrop expecting
  // cancel got a new dashboard instead. Guard against the keyboard fire-once
  // path: pressing Return also blurs the input, so the second call after the
  // first commit needs to be a no-op.
  const creatingCommittedRef = useRef(false);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  // `height` is 0 when the keyboard is hidden and goes to a negative value
  // (-keyboardHeight) when shown. Adding it to translateY lifts the whole
  // sheet above the keyboard so its TextInputs aren't obscured.
  const keyboard = useReanimatedKeyboardAnimation();

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
      // Reset transient editing state when the sheet closes so reopening starts
      // fresh.
      setCreating(false);
      setCreateDraft("");
      creatingCommittedRef.current = false;
      backdrop.value = withTiming(0, { duration: 180 });
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 240, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + keyboard.height.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const handlePan = Gesture.Pan()
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

  function handleSelect(id: string) {
    if (id === activeDashboardId) {
      onClose();
      return;
    }
    Haptics.selectionAsync();
    setActiveDashboard(id);
    onClose();
  }

  function handleRemove(d: Dashboard) {
    if (dashboards.length <= 1) return;
    setPendingRemove(d);
  }

  function handleOpenEditor(d: Dashboard) {
    Haptics.selectionAsync();
    // Skip the sheet's 240ms slide-out animation here — the user is about
    // to see a full-screen push, and that close animation just delays the
    // route transition (since the Modal sits on top of the underlying nav
    // stack until it unmounts). Snapping the modal closed lets the push
    // start visually right away.
    setCreating(false);
    setCreateDraft("");
    creatingCommittedRef.current = false;
    translateY.value = OFFSCREEN;
    backdrop.value = 0;
    setMounted(false);
    onClose();
    router.push(`/dashboard-edit/${d.id}` as any);
  }

  function commitCreate() {
    if (creatingCommittedRef.current) return;
    const trimmed = createDraft.trim();
    if (trimmed.length === 0) {
      // Nothing to commit yet — keep the row open so the user can keep typing
      // instead of bouncing them out on accidental Return.
      return;
    }
    creatingCommittedRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const created = addDashboard(trimmed);
    setActiveDashboard(created.id);
    setCreating(false);
    setCreateDraft("");
    // Snap the picker closed and push to the editor in the same frame so a
    // freshly-created dashboard is immediately configurable. The picker's
    // 240ms slide-out would otherwise sit on top of the route push.
    translateY.value = OFFSCREEN;
    backdrop.value = 0;
    setMounted(false);
    onClose();
    router.push(`/dashboard-edit/${created.id}` as any);
  }

  function cancelCreate() {
    Haptics.selectionAsync();
    creatingCommittedRef.current = false;
    setCreating(false);
    setCreateDraft("");
  }

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
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
                paddingBottom: insets.bottom + 8,
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
                      Dashboards
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      {dashboards.length === 1
                        ? "1 dashboard"
                        : `${dashboards.length} dashboards`}
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
              keyboardShouldPersistTaps="handled"
            >
              <View className="gap-2">
                {dashboards.map((d, index) => {
                  const isActive = d.id === activeDashboardId;
                  const isFirst = index === 0;
                  const isLast = index === dashboards.length - 1;
                  const rowIcon = resolveDashboardIcon(d.icon);
                  const rowColor = resolveDashboardColor(d.color);

                  return (
                    <View
                      key={d.id}
                      className={`rounded-2xl border px-3 py-3 ${
                        isActive
                          ? "border-primary/40"
                          : "bg-surface-light border-border/70"
                      }`}
                      style={
                        isActive
                          ? { backgroundColor: `${rowColor}1A` }
                          : undefined
                      }
                    >
                      <View className="flex-row items-center gap-3">
                        <View
                          className="w-10 h-10 rounded-xl items-center justify-center"
                          style={{ backgroundColor: `${rowColor}26` }}
                        >
                          {isActive ? (
                            <Icon icon={Check} size={ICON.MD} color={rowColor} />
                          ) : (
                            createElement(rowIcon, { size: 20, color: rowColor })
                          )}
                        </View>
                        <View className="flex-1">
                          <Pressable
                            onPress={() => handleSelect(d.id)}
                            hitSlop={6}
                          >
                            {/* Name gets the full row width (only the icon
                                sits beside it) so longer names like
                                "HomeServer" stay on a single line at every
                                uiScale. Action buttons live on a second row
                                below so they never squeeze this column.
                                Renaming lives in the dedicated edit screen
                                (tap the gear) — keeps this row tidy and
                                avoids two name-edit affordances. */}
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
                              {d.widgets.length === 0
                                ? "No widgets yet"
                                : `${d.widgets.length} widget${d.widgets.length === 1 ? "" : "s"}`}
                            </Text>
                          </Pressable>
                        </View>
                      </View>

                      <View className="flex-row items-center justify-end gap-1 mt-2">
                          <Pressable
                            onPress={() => moveDashboard(d.id, "up")}
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
                            onPress={() => moveDashboard(d.id, "down")}
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
                            onPress={() => handleOpenEditor(d)}
                            hitSlop={6}
                            className="p-1 ml-1"
                          >
                            <Icon icon={SettingsIcon} size={ICON.MD} color="#60a5fa" />
                          </Pressable>
                          <Pressable
                            onPress={() => handleRemove(d)}
                            disabled={dashboards.length <= 1}
                            hitSlop={6}
                            className="p-1 ml-1"
                          >
                            <Icon
                              icon={Trash2}
                              size={ICON.MD}
                              color={
                                dashboards.length <= 1 ? "#3f3f46" : "#ef4444"
                              }
                            />
                          </Pressable>
                        </View>

                    </View>
                  );
                })}

                {creating ? (
                  <View className="rounded-2xl border border-primary/40 bg-primary/10 px-3 py-3 flex-row items-center gap-3">
                    <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center">
                      <Icon icon={Plus} size={ICON.MD} color="#60a5fa" />
                    </View>
                    <TextInput
                      value={createDraft}
                      onChangeText={setCreateDraft}
                      onSubmitEditing={commitCreate}
                      returnKeyType="done"
                      autoFocus
                      maxLength={40}
                      className="flex-1 text-zinc-100 text-base font-semibold"
                      placeholder="Dashboard name"
                      placeholderTextColor="#52525b"
                    />
                    <Pressable
                      onPress={cancelCreate}
                      hitSlop={8}
                      className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                    >
                      <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
                    </Pressable>
                    <Pressable
                      onPress={commitCreate}
                      disabled={createDraft.trim().length === 0}
                      hitSlop={8}
                      className="w-9 h-9 rounded-full bg-primary/20 items-center justify-center active:opacity-70"
                      style={{ opacity: createDraft.trim().length === 0 ? 0.4 : 1 }}
                    >
                      <Icon icon={Check} size={ICON.SM} color="#60a5fa" />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      creatingCommittedRef.current = false;
                      setCreating(true);
                    }}
                    className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-4 mt-1 active:opacity-70"
                  >
                    <Icon icon={Plus} size={ICON.MD} color="#a1a1aa" />
                    <Text className="text-zinc-300 text-sm font-medium">
                      Add dashboard
                    </Text>
                  </Pressable>
                )}
              </View>
            </ScrollView>
          </Animated.View>

          {/* In-sheet confirm — a nested native Modal can't reliably present
              over this one on iOS, so we overlay the confirm inside the sheet's
              own Modal instead of stacking a ConfirmModal. */}
          {pendingRemove && (
            <View
              style={StyleSheet.absoluteFill}
              className="items-center justify-center px-8"
            >
              <Pressable
                style={StyleSheet.absoluteFill}
                className="bg-black/70"
                onPress={() => setPendingRemove(null)}
              />
              <View className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 gap-4">
                <View className="flex-row items-center gap-3">
                  <View className="bg-danger/15 rounded-xl p-2.5">
                    <Icon icon={Trash2} size={20} color="#ef4444" />
                  </View>
                  <Text className="text-zinc-100 text-lg font-semibold flex-1">
                    Delete dashboard?
                  </Text>
                </View>
                <Text className="text-zinc-400 text-sm leading-5">
                  {`"${pendingRemove.name}" and its widget settings will be removed. This cannot be undone.`}
                </Text>
                <View className="flex-row gap-3 mt-1">
                  <Pressable
                    onPress={() => setPendingRemove(null)}
                    className="flex-1 rounded-xl border border-border py-2.5 items-center active:opacity-70"
                  >
                    <Text className="text-zinc-300 text-sm font-semibold">
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                      removeDashboard(pendingRemove.id);
                      setPendingRemove(null);
                    }}
                    className="flex-1 rounded-xl bg-danger py-2.5 items-center active:opacity-70"
                  >
                    <Text className="text-white text-sm font-semibold">
                      Delete
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

