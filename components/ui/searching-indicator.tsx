import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { Search } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useUiScale } from "@/hooks/use-ui-scale";

const RING_MS = 2400;
// Radius of the magnifier's small sweeping circle, in px at uiScale 1.
const ORBIT = 3;

function Ring({ progress }: { progress: SharedValue<number> }) {
  const tc = useThemeColor();
  const style = useAnimatedStyle(() => ({
    opacity: 0.55 * (1 - progress.value),
    transform: [{ scale: 1 + progress.value * 0.6 }],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { borderRadius: 999, borderWidth: 1.5, borderColor: tc("#3b82f6") },
        style,
      ]}
    />
  );
}

/**
 * The icon for a long-running search's waiting state: a magnifier sweeping a
 * small circle while rings pulse out from it, so a search that takes a minute
 * never looks frozen. Drop it into `EmptyState`'s `icon` slot with
 * `iconClassName="mt-5 mb-8"` so the rings clear the text; pair it with
 * `SearchElapsed` so there is a moving number even with reduced motion on.
 */
export function SearchingIndicator() {
  const scale = useUiScale();
  // Reduce Motion jumps the orbit straight to its end (2π), which would park
  // the magnifier off-centre; centre it instead.
  const radius = useReducedMotion() ? 0 : ORBIT * scale;
  const ringA = useSharedValue(0);
  const ringB = useSharedValue(0);
  const orbit = useSharedValue(0);

  useEffect(() => {
    // Decorative motion follows the OS Reduce Motion setting; the elapsed
    // counter carries the "still working" signal on its own.
    const ring = () =>
      withRepeat(
        withTiming(1, {
          duration: RING_MS,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        }),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    ringA.value = ring();
    ringB.value = withDelay(RING_MS / 2, ring(), ReduceMotion.System);
    orbit.value = withRepeat(
      withTiming(2 * Math.PI, {
        duration: 2000,
        easing: Easing.linear,
        reduceMotion: ReduceMotion.System,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
  }, [ringA, ringB, orbit]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(orbit.value) * radius },
      { translateY: Math.sin(orbit.value) * radius },
    ],
  }));

  return (
    <View className="w-full h-full items-center justify-center">
      <Ring progress={ringA} />
      <Ring progress={ringB} />
      <Animated.View style={iconStyle}>
        <Icon icon={Search} size={28} color="#60a5fa" />
      </Animated.View>
    </View>
  );
}

/** "0:42" — how long the search has been running, for the waiting state. */
export function SearchElapsed({ seconds }: { seconds: number }) {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, "0");
  return (
    <Text
      className="text-zinc-500 text-xs text-center"
      style={{ fontVariant: ["tabular-nums"] }}
      accessibilityLabel={`Searching for ${seconds} seconds`}
    >
      {m}:{s}
    </Text>
  );
}
