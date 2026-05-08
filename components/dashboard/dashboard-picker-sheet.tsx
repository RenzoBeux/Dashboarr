import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
  TextInput,
  Alert,
} from "react-native";
import {
  Check,
  ChevronUp,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
  X,
  LayoutDashboard,
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
  const renameDashboard = useConfigStore((s) => s.renameDashboard);
  const setActiveDashboard = useConfigStore((s) => s.setActiveDashboard);
  const moveDashboard = useConfigStore((s) => s.moveDashboard);
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  // Submitting via the keyboard return key fires `onSubmitEditing` and then,
  // when the input loses focus, `onBlur` — both wired to the same commit
  // function. The ref guard makes the second call a no-op so we don't add the
  // dashboard twice (or rename it twice).
  const creatingCommittedRef = useRef(false);
  const renamingCommittedRef = useRef(false);
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
      setRenamingId(null);
      setCreating(false);
      setCreateDraft("");
      creatingCommittedRef.current = false;
      renamingCommittedRef.current = false;
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

  function startRename(d: Dashboard) {
    Haptics.selectionAsync();
    renamingCommittedRef.current = false;
    setRenamingId(d.id);
    setRenameDraft(d.name);
  }

  function commitRename() {
    if (renamingCommittedRef.current) return;
    renamingCommittedRef.current = true;
    if (!renamingId) return;
    const trimmed = renameDraft.trim();
    if (trimmed.length > 0) {
      renameDashboard(renamingId, trimmed);
    }
    setRenamingId(null);
  }

  function handleRemove(d: Dashboard) {
    if (dashboards.length <= 1) return;
    Alert.alert(
      "Delete dashboard?",
      `"${d.name}" and its widget settings will be removed. This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            removeDashboard(d.id);
          },
        },
      ],
    );
  }

  function commitCreate() {
    if (creatingCommittedRef.current) return;
    creatingCommittedRef.current = true;
    const trimmed = createDraft.trim();
    if (trimmed.length === 0) {
      setCreating(false);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const created = addDashboard(trimmed);
    setActiveDashboard(created.id);
    setCreating(false);
    setCreateDraft("");
    onClose();
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
                  const isRenaming = renamingId === d.id;
                  const isFirst = index === 0;
                  const isLast = index === dashboards.length - 1;

                  return (
                    <View
                      key={d.id}
                      className={`rounded-2xl border px-3 py-3 ${
                        isActive
                          ? "bg-primary/10 border-primary/40"
                          : "bg-surface-light border-border/70"
                      }`}
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center">
                          <Icon
                            icon={isActive ? Check : LayoutDashboard}
                            size={ICON.MD}
                            color="#60a5fa"
                          />
                        </View>
                        <View className="flex-1">
                          {isRenaming ? (
                            <TextInput
                              value={renameDraft}
                              onChangeText={setRenameDraft}
                              onBlur={commitRename}
                              onSubmitEditing={commitRename}
                              autoFocus
                              maxLength={40}
                              className="text-zinc-100 text-base font-semibold"
                              placeholder="Dashboard name"
                              placeholderTextColor="#52525b"
                            />
                          ) : (
                            <Pressable
                              onPress={() => handleSelect(d.id)}
                              hitSlop={6}
                            >
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
                          )}
                        </View>

                        <View className="flex-row items-center gap-1">
                          {!isRenaming && (
                            <>
                              <Pressable
                                onPress={() =>
                                  moveDashboard(d.id, "up")
                                }
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
                                onPress={() =>
                                  moveDashboard(d.id, "down")
                                }
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
                                onPress={() => startRename(d)}
                                hitSlop={6}
                                className="p-1 ml-1"
                              >
                                <Icon icon={Pencil} size={ICON.MD} color="#60a5fa" />
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
                            </>
                          )}
                        </View>
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
                      onBlur={commitCreate}
                      onSubmitEditing={commitCreate}
                      autoFocus
                      maxLength={40}
                      className="flex-1 text-zinc-100 text-base font-semibold"
                      placeholder="Dashboard name"
                      placeholderTextColor="#52525b"
                    />
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
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
