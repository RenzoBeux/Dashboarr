import { memo, useEffect, useState } from "react";
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
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
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useBottomInset } from "@/hooks/use-bottom-inset";
import * as Haptics from "expo-haptics";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { ICON } from "@/lib/constants";
import { useAppTheme } from "@/hooks/use-app-theme";
import {
  LUCIDE_BY_NAME,
  LUCIDE_ICON_NAMES,
  type DashboardIconName,
} from "@/lib/dashboard-icons";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX_HEIGHT = Math.round(SCREEN_H * 0.82);
const OFFSCREEN = SHEET_MAX_HEIGHT + 120;

interface DashboardIconPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  selected: string;
  color: string;
  onSelect: (icon: DashboardIconName) => void;
  // Header title — lets reusers (e.g. the per-tab icon override picker) say
  // what the icon is being chosen for.
  title?: string;
}

export function DashboardIconPickerSheet({
  visible,
  onClose,
  selected,
  color,
  onSelect,
  title = "Choose icon",
}: DashboardIconPickerSheetProps) {
  const bottomInset = useBottomInset();
  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

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

  function handlePick(name: DashboardIconName) {
    Haptics.selectionAsync();
    onSelect(name);
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
                      {title}
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      {LUCIDE_ICON_NAMES.length} icons
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
              {/* Mount lazily — the user pays the SVG mount cost only once
                  per session when they open the sheet, instead of on every
                  edit-screen navigation. Cells stagger in via FadeInDown so
                  the grid feels alive rather than popping in. */}
              <View className="flex-row flex-wrap gap-2">
                {LUCIDE_ICON_NAMES.map((name, idx) => (
                  <IconCell
                    key={name}
                    name={name}
                    selected={name === selected}
                    color={color}
                    index={idx}
                    onPress={() => handlePick(name)}
                  />
                ))}
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

interface IconCellProps {
  name: DashboardIconName;
  selected: boolean;
  color: string;
  index: number;
  onPress: () => void;
}

const IconCell = memo(function IconCell({
  name,
  selected,
  color,
  index,
  onPress,
}: IconCellProps) {
  const theme = useAppTheme();
  const Comp = LUCIDE_BY_NAME[name];
  // Cap the cascade delay — past ~30 cells the stagger should be effectively
  // simultaneous so the bottom of the grid doesn't look like it's still
  // loading after the sheet has settled.
  const delay = Math.min(index, 30) * 12;
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(220)}>
      <Pressable
        onPress={onPress}
        hitSlop={4}
        className="w-12 h-12 rounded-xl items-center justify-center"
        style={{
          backgroundColor: selected ? `${color}26` : theme.surfaceLight,
          borderColor: selected ? color : theme.border,
          borderWidth: selected ? 2 : 1,
        }}
      >
        <Icon
          icon={Comp}
          size={22}
          color={selected ? color : "#a1a1aa"}
        />
      </Pressable>
    </Animated.View>
  );
});
