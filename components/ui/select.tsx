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
import { ChevronDown, Check, X } from "lucide-react-native";
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
import { lightHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";
import { GlassSurface } from "@/components/ui/glass-surface";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX = Math.round(SCREEN_H * 0.85);
const OFFSCREEN = SHEET_MAX + 140;

export interface SelectOption<T extends string | number> {
  value: T;
  label: string;
  description?: string;
}

interface SelectProps<T extends string | number> {
  label: string;
  value: T | undefined;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  containerClassName?: string;
}

export function Select<T extends string | number>({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  disabled = false,
  containerClassName = "",
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <View className={containerClassName}>
      <Text className="text-zinc-400 text-sm mb-1.5">{label}</Text>
      <Pressable
        onPress={() => {
          if (disabled) return;
          lightHaptic();
          setOpen(true);
        }}
        disabled={disabled}
        className={`flex-row items-center justify-between bg-surface-light border border-border rounded-xl px-4 py-3 ${
          disabled ? "opacity-50" : "active:opacity-70"
        }`}
      >
        <Text
          className={`text-base flex-1 ${
            selected ? "text-zinc-100" : "text-zinc-500"
          }`}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </Text>
        <Icon icon={ChevronDown} size={18} color="#71717a" />
      </Pressable>

      <SelectSheet
        title={label}
        visible={open}
        onClose={() => setOpen(false)}
        options={options}
        value={value}
        onChange={(v) => {
          onChange(v);
          setOpen(false);
        }}
      />
    </View>
  );
}

interface SelectSheetProps<T extends string | number> {
  title: string;
  visible: boolean;
  onClose: () => void;
  options: SelectOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
}

function SelectSheet<T extends string | number>({
  title,
  visible,
  onClose,
  options,
  value,
  onChange,
}: SelectSheetProps<T>) {
  const bottomInset = useBottomInset();
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

  const handlePan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 24, stiffness: 210 });
      }
    });

  function handleSelect(option: SelectOption<T>) {
    lightHaptic();
    onChange(option.value);
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
                maxHeight: SHEET_MAX,
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
              <View>
                <View className="items-center pt-3 pb-1">
                  <View className="w-10 h-1 rounded-full bg-zinc-700" />
                </View>

                <View className="flex-row items-start justify-between px-5 pt-3 pb-3">
                  <View className="flex-1 pr-3">
                    <Text
                      className="text-zinc-100 text-lg font-bold"
                      numberOfLines={2}
                    >
                      {title}
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
                <View className="h-px bg-border/60 mx-5 mb-1" />
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="px-3 pt-2 pb-2"
              showsVerticalScrollIndicator={false}
            >
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    key={String(option.value)}
                    onPress={() => handleSelect(option)}
                    className={`flex-row items-center gap-3 rounded-2xl px-3 py-3 mb-1 ${
                      isSelected ? "bg-surface-light/70" : "active:bg-surface-light/70"
                    }`}
                  >
                    <View className="flex-1">
                      <Text
                        className={`text-base ${
                          isSelected
                            ? "text-primary font-semibold"
                            : "text-zinc-100 font-medium"
                        }`}
                      >
                        {option.label}
                      </Text>
                      {option.description && (
                        <Text className="text-zinc-500 text-xs mt-0.5">
                          {option.description}
                        </Text>
                      )}
                    </View>
                    {isSelected && (
                      <Icon icon={Check} size={ICON.SM} color="#3b82f6" />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
