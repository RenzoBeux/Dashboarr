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
import { X, Check, Circle } from "lucide-react-native";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { lightHaptic } from "@/lib/haptics";
import { ICON } from "@/lib/constants";
import { GlassSurface } from "@/components/ui/glass-surface";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX = Math.round(SCREEN_H * 0.85);
const OFFSCREEN = SHEET_MAX + 140;

// Generic radio entry. K stays a string-literal type so callers get
// exhaustiveness checking on labels/values.
export interface SheetOption<K extends string> {
  key: K;
  label: string;
}

interface FilterSortSheetProps<F extends string, S extends string> {
  visible: boolean;
  onClose: () => void;
  title?: string;
  filterLabel?: string;
  filterOptions: SheetOption<F>[];
  filterValue: F;
  onFilterChange: (next: F) => void;
  sortLabel?: string;
  sortOptions: SheetOption<S>[];
  sortValue: S;
  onSortChange: (next: S) => void;
}

/**
 * Combined filter+sort selector sheet. The previous chip-row + Sort button
 * layout broke at higher UI scales — once the chip row could scroll, the
 * Sort button (anchored to the right) visually clipped the rightmost chip,
 * making it look hidden. This sheet folds both controls into one entry
 * point, with section headers, so neither competes for horizontal space.
 *
 * The sheet stays open across selections (unlike ActionSheet which auto-
 * closes) so the user can change the filter and the sort in one visit.
 */
export function FilterSortSheet<F extends string, S extends string>({
  visible,
  onClose,
  title,
  filterLabel = "Show",
  filterOptions,
  filterValue,
  onFilterChange,
  sortLabel = "Sort by",
  sortOptions,
  sortValue,
  onSortChange,
}: FilterSortSheetProps<F, S>) {
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
              <View>
                <View className="items-center pt-3 pb-1">
                  <View className="w-10 h-1 rounded-full bg-zinc-700" />
                </View>

                {title ? (
                  <>
                    <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
                      <Text
                        className="text-zinc-100 text-lg font-bold flex-1 pr-3"
                        numberOfLines={2}
                      >
                        {title}
                      </Text>
                      <Pressable
                        onPress={onClose}
                        hitSlop={10}
                        className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                      >
                        <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
                      </Pressable>
                    </View>
                    <View className="h-px bg-border/60 mx-5 mb-1" />
                  </>
                ) : null}
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="px-3 pt-2 pb-2"
              showsVerticalScrollIndicator={false}
            >
              <SectionHeader>{filterLabel}</SectionHeader>
              {filterOptions.map((opt) => (
                <RadioRow
                  key={opt.key}
                  label={opt.label}
                  selected={opt.key === filterValue}
                  onPress={() => {
                    if (opt.key === filterValue) return;
                    lightHaptic();
                    onFilterChange(opt.key);
                  }}
                />
              ))}
              <View className="h-2" />
              <SectionHeader>{sortLabel}</SectionHeader>
              {sortOptions.map((opt) => (
                <RadioRow
                  key={opt.key}
                  label={opt.label}
                  selected={opt.key === sortValue}
                  onPress={() => {
                    if (opt.key === sortValue) return;
                    lightHaptic();
                    onSortChange(opt.key);
                  }}
                />
              ))}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-xs font-bold uppercase tracking-widest px-3 pt-3 pb-1">
      {children}
    </Text>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3 py-3 rounded-xl active:bg-surface-light ${
        selected ? "bg-primary/10" : ""
      }`}
    >
      <Icon
        icon={selected ? Check : Circle}
        size={18}
        color={selected ? "#3b82f6" : "#52525b"}
      />
      <Text
        className={`text-base flex-1 ${
          selected ? "text-zinc-100 font-medium" : "text-zinc-300"
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
