import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  StyleSheet,
} from "react-native";
import { X } from "lucide-react-native";
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
import { lightHaptic, errorHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX = Math.round(SCREEN_H * 0.85);
const OFFSCREEN = SHEET_MAX + 140;

export type ActionSheetVariant = "default" | "danger";

export interface ActionSheetAction {
  label: string;
  icon?: React.ReactNode;
  variant?: ActionSheetVariant;
  disabled?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  actions: ActionSheetAction[];
}

export function ActionSheet({
  visible,
  onClose,
  title,
  subtitle,
  actions,
}: ActionSheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 210,
        mass: 0.9,
      });
      backdrop.value = withTiming(1, { duration: 180 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 220, easing: Easing.in(Easing.cubic) },
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

  function handleAction(action: ActionSheetAction) {
    if (action.disabled) return;
    if (action.variant === "danger") errorHaptic();
    else lightHaptic();
    onClose();
    action.onPress();
  }

  const hasHeader = Boolean(title || subtitle);

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
            { maxHeight: SHEET_MAX, paddingBottom: insets.bottom + 8 },
          ]}
          className="bg-surface rounded-t-3xl border-t border-border"
        >
          <View className="items-center pt-3 pb-1">
            <View className="w-10 h-1 rounded-full bg-zinc-700" />
          </View>

          {hasHeader && (
            <>
              <View className="flex-row items-start justify-between px-5 pt-3 pb-3">
                <View className="flex-1 pr-3">
                  {title && (
                    <Text
                      className="text-zinc-100 text-lg font-bold"
                      numberOfLines={2}
                    >
                      {title}
                    </Text>
                  )}
                  {subtitle && (
                    <Text
                      className="text-zinc-500 text-xs mt-0.5"
                      numberOfLines={1}
                    >
                      {subtitle}
                    </Text>
                  )}
                </View>
                <Pressable
                  onPress={onClose}
                  hitSlop={10}
                  className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                >
                  <X size={ICON.SM} color="#a1a1aa" />
                </Pressable>
              </View>
              <View className="h-px bg-border/60 mx-5 mb-1" />
            </>
          )}

          <ScrollView
            contentContainerClassName="px-3 pt-2 pb-2"
            showsVerticalScrollIndicator={false}
          >
            {actions.map((action, i) => (
              <Animated.View
                key={i}
                entering={FadeInDown.delay(i * 25).duration(220)}
              >
                <ActionRow action={action} onPress={() => handleAction(action)} />
              </Animated.View>
            ))}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

interface ActionRowProps {
  action: ActionSheetAction;
  onPress: () => void;
}

function ActionRow({ action, onPress }: ActionRowProps) {
  const isDanger = action.variant === "danger";
  const disabled = Boolean(action.disabled);
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={style}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        onPressIn={() => {
          if (disabled) return;
          scale.value = withSpring(0.98, { damping: 20, stiffness: 320 });
        }}
        onPressOut={() => {
          scale.value = withSpring(1, { damping: 20, stiffness: 320 });
        }}
        className={`flex-row items-center gap-3 rounded-2xl px-3 py-3 mb-1 ${
          disabled ? "opacity-40" : "active:bg-surface-light/70"
        }`}
      >
        {action.icon && (
          <View
            className={`w-10 h-10 rounded-xl items-center justify-center ${
              isDanger ? "bg-danger/15" : "bg-surface-light"
            }`}
          >
            {action.icon}
          </View>
        )}
        <Text
          className={`flex-1 text-[15px] ${
            isDanger
              ? "text-danger font-semibold"
              : "text-zinc-100 font-medium"
          }`}
          numberOfLines={1}
        >
          {action.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
