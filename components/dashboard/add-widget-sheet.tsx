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
import { LayoutGrid, Lock, Plus, X } from "lucide-react-native";
import Animated, {
  Easing,
  FadeInDown,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS, ICON } from "@/lib/constants";
import {
  getAvailableWidgets,
  type WidgetDefinition,
} from "@/components/dashboard/widget-registry";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface AddWidgetSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function AddWidgetSheet({ visible, onClose }: AddWidgetSheetProps) {
  const dashboardWidgets = useConfigStore((s) => s.dashboardWidgets);
  const services = useConfigStore((s) => s.services);
  const addWidget = useConfigStore((s) => s.addWidget);
  const insets = useSafeAreaInsets();

  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  const available = getAvailableWidgets(dashboardWidgets);
  const enabled = available.filter(
    (w) => w.service === null || services[w.service].enabled,
  );
  const locked = available.filter(
    (w) => w.service !== null && !services[w.service].enabled,
  );

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

  function handleAdd(widget: WidgetDefinition) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    addWidget(widget.id);
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
          <View className="pt-3 pb-1">
            <View className="self-center w-10 h-1 rounded-full bg-zinc-700" />

            <View className="flex-row items-center justify-between px-5 pt-4 pb-3">
              <View className="flex-1 pr-3">
                <Text className="text-zinc-100 text-xl font-bold">
                  Add widget
                </Text>
                <Text className="text-zinc-500 text-xs mt-0.5">
                  {available.length === 0
                    ? "All widgets are on your dashboard"
                    : `${available.length} widget${available.length === 1 ? "" : "s"} available`}
                </Text>
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

          {available.length === 0 ? (
            <View className="items-center py-10 px-8">
              <View className="w-14 h-14 rounded-full bg-surface-light items-center justify-center mb-3">
                <LayoutGrid size={24} color="#71717a" />
              </View>
              <Text className="text-zinc-300 text-base font-medium">
                You're all set
              </Text>
              <Text className="text-zinc-500 text-sm text-center mt-1">
                Every widget is already on your dashboard.
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerClassName="px-4 pt-1 pb-4"
              showsVerticalScrollIndicator={false}
            >
              {enabled.length > 0 && (
                <View>
                  <SectionLabel label="Available" />
                  <View className="gap-2">
                    {enabled.map((widget, idx) => (
                      <EnabledRow
                        key={widget.id}
                        widget={widget}
                        index={idx}
                        onAdd={() => handleAdd(widget)}
                      />
                    ))}
                  </View>
                </View>
              )}

              {locked.length > 0 && (
                <View className={enabled.length > 0 ? "mt-5" : ""}>
                  <SectionLabel label="Requires setup" />
                  <View className="gap-2">
                    {locked.map((widget, idx) => (
                      <LockedRow
                        key={widget.id}
                        widget={widget}
                        index={idx + enabled.length}
                      />
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Text className="text-zinc-500 text-[11px] font-semibold uppercase tracking-wider px-1 mb-2">
      {label}
    </Text>
  );
}

interface EnabledRowProps {
  widget: WidgetDefinition;
  index: number;
  onAdd: () => void;
}

function EnabledRow({ widget, index, onAdd }: EnabledRowProps) {
  const Icon = widget.icon;
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      entering={FadeInDown.delay(index * 35).duration(260)}
      style={style}
    >
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.97, { damping: 18, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 18, stiffness: 320 });
        }}
        onPress={onAdd}
        className="flex-row items-center gap-3 bg-surface-light rounded-2xl px-3 py-3 border border-border/70"
      >
        <View className="w-10 h-10 rounded-xl bg-primary/15 items-center justify-center">
          <Icon size={ICON.MD} color="#60a5fa" />
        </View>
        <View className="flex-1">
          <Text className="text-zinc-100 text-sm font-semibold">
            {widget.label}
          </Text>
          <Text
            className="text-zinc-500 text-xs mt-0.5"
            numberOfLines={1}
          >
            {widget.description}
          </Text>
        </View>
        <View className="w-7 h-7 rounded-full bg-primary/20 items-center justify-center">
          <Plus size={ICON.SM} color="#60a5fa" />
        </View>
      </Pressable>
    </Animated.View>
  );
}

interface LockedRowProps {
  widget: WidgetDefinition;
  index: number;
}

function LockedRow({ widget, index }: LockedRowProps) {
  const Icon = widget.icon;
  const serviceName =
    widget.service !== null ? SERVICE_DEFAULTS[widget.service].name : "service";
  return (
    <Animated.View entering={FadeInDown.delay(index * 35).duration(260)}>
      <View className="flex-row items-center gap-3 bg-surface-light/50 rounded-2xl px-3 py-3 border border-border/40">
        <View className="w-10 h-10 rounded-xl bg-surface-light items-center justify-center">
          <Icon size={ICON.MD} color="#52525b" />
        </View>
        <View className="flex-1">
          <Text className="text-zinc-400 text-sm font-semibold">
            {widget.label}
          </Text>
          <Text
            className="text-zinc-600 text-xs mt-0.5"
            numberOfLines={1}
          >
            Enable {serviceName} in Settings
          </Text>
        </View>
        <View className="w-7 h-7 rounded-full bg-surface-light items-center justify-center border border-border">
          <Lock size={ICON.XS} color="#71717a" />
        </View>
      </View>
    </Animated.View>
  );
}
