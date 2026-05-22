import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  ScrollView,
  Pressable,
  Dimensions,
  StyleSheet,
} from "react-native";
import { RotateCcw, X } from "lucide-react-native";
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
import {
  WIDGET_REGISTRY,
  type WidgetDefinition,
} from "@/components/dashboard/widget-registry";
import type { WidgetSlot } from "@/store/config-store";
import { GlassSurface } from "@/components/ui/glass-surface";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface WidgetSettingsSheetProps {
  slotId: string | null;
  onClose: () => void;
}

export function WidgetSettingsSheet({
  slotId,
  onClose,
}: WidgetSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const resetSlotSettings = useConfigStore((s) => s.resetSlotSettings);
  // True when the slot has any persisted overrides — drives whether the
  // "Reset to defaults" button is shown.
  const hasSettings = useConfigStore((s) => {
    if (!slotId) return false;
    for (const d of s.dashboards) {
      const slot = d.widgets.find((w) => w.id === slotId);
      if (slot) return slot.settings !== undefined;
    }
    return false;
  });
  const slot = useConfigStore((s) => {
    if (!slotId) return undefined;
    for (const d of s.dashboards) {
      const found = d.widgets.find((w) => w.id === slotId);
      if (found) return found;
    }
    return undefined;
  });

  const [mounted, setMounted] = useState(false);
  // Cache the last visible slot+widget so the sheet can render its definition
  // through the closing animation, even after `slotId` becomes null.
  const [activeSlot, setActiveSlot] = useState<{
    slot: WidgetSlot;
    widget: WidgetDefinition;
  } | null>(null);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  // `keyboard.height.value` is 0 when hidden and -keyboardHeight when shown.
  // Adding it to translateY lifts the sheet above the keyboard so the "Hide
  // users" TextInputs inside widget settings stay visible on iOS.
  const keyboard = useReanimatedKeyboardAnimation();

  const visible = slotId !== null;

  useEffect(() => {
    if (slot) {
      const widget = WIDGET_REGISTRY[slot.widgetId];
      if (widget) setActiveSlot({ slot, widget });
    }
  }, [slot]);

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

  function handleReset() {
    if (!activeSlot) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetSlotSettings(activeSlot.slot.id);
  }

  if (!activeSlot) {
    return null;
  }

  const WidgetIcon = activeSlot.widget.icon;
  const SettingsComponent = activeSlot.widget.settingsComponent;

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
              { maxHeight: SHEET_MAX_HEIGHT, paddingBottom: insets.bottom + 8, overflow: "hidden" },
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
                  <View className="flex-row items-center flex-1 gap-3 pr-3">
                    <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center">
                      <Icon icon={WidgetIcon} size={ICON.MD} color="#60a5fa" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-100 text-xl font-bold">
                        {activeSlot.widget.label}
                      </Text>
                      <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
                        Widget settings
                      </Text>
                    </View>
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
              contentContainerClassName="pt-1 pb-4"
              showsVerticalScrollIndicator={false}
            >
              {SettingsComponent ? (
                <SettingsComponent slotId={activeSlot.slot.id} onClose={onClose} />
              ) : (
                <View className="px-4 py-6 items-center">
                  <Text className="text-zinc-400 text-sm text-center">
                    This widget has no configurable options.
                  </Text>
                </View>
              )}

              {hasSettings && SettingsComponent && (
                <View className="px-4 mt-3">
                  <Pressable
                    onPress={handleReset}
                    className="flex-row items-center justify-center gap-2 py-3 rounded-xl border border-border active:opacity-70"
                  >
                    <Icon icon={RotateCcw} size={ICON.SM} color="#a1a1aa" />
                    <Text className="text-zinc-300 text-sm font-medium">
                      Reset to defaults
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
