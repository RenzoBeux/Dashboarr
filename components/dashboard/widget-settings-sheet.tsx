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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useConfigStore } from "@/store/config-store";
import { ICON } from "@/lib/constants";
import {
  WIDGET_REGISTRY,
  type WidgetDefinition,
} from "@/components/dashboard/widget-registry";
import type { WidgetId } from "@/lib/constants";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface WidgetSettingsSheetProps {
  widgetId: WidgetId | null;
  onClose: () => void;
}

export function WidgetSettingsSheet({
  widgetId,
  onClose,
}: WidgetSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const resetWidgetSettings = useConfigStore((s) => s.resetWidgetSettings);
  const hasSettings = useConfigStore(
    (s) => widgetId !== null && widgetId in s.widgetSettings,
  );

  const [mounted, setMounted] = useState(false);
  // Cache the last visible widget so the sheet can render its definition
  // through the closing animation, even after `widgetId` becomes null.
  const [activeWidget, setActiveWidget] = useState<WidgetDefinition | null>(null);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  const visible = widgetId !== null;

  useEffect(() => {
    if (widgetId) {
      setActiveWidget(WIDGET_REGISTRY[widgetId] ?? null);
    }
  }, [widgetId]);

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
    transform: [{ translateY: translateY.value }],
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
    if (!activeWidget) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    resetWidgetSettings(activeWidget.id);
  }

  if (!activeWidget) {
    return null;
  }

  const Icon = activeWidget.icon;
  const SettingsComponent = activeWidget.settingsComponent;

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
              { maxHeight: SHEET_MAX_HEIGHT, paddingBottom: insets.bottom + 8 },
            ]}
            className="bg-surface rounded-t-3xl border-t border-border"
          >
            <GestureDetector gesture={handlePan}>
              <View className="pt-3 pb-1">
                <View className="self-center w-10 h-1 rounded-full bg-zinc-700" />

                <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
                  <View className="flex-row items-center flex-1 gap-3 pr-3">
                    <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center">
                      <Icon size={ICON.MD} color="#60a5fa" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-100 text-xl font-bold">
                        {activeWidget.label}
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
                    <X size={ICON.SM} color="#a1a1aa" />
                  </Pressable>
                </View>
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="pt-1 pb-4"
              showsVerticalScrollIndicator={false}
            >
              {SettingsComponent ? (
                <SettingsComponent onClose={onClose} />
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
                    <RotateCcw size={ICON.SM} color="#a1a1aa" />
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
