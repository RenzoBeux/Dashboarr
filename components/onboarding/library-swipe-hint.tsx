import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { Pointer } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

// Horizontal travel of the hand/dot, in px each direction from center.
const SWIPE = 34;
// One full demo loop (press → swipe left → lift → reset).
const CYCLE_MS = 1700;
// How long the whole coachmark stays before fading itself out.
const VISIBLE_MS = 5200;

// Classic "touch + swiping hand" coachmark: a translucent white touch-dot with
// a hand that presses down and swipes left, looping. It floats above the
// content (pointerEvents="none") so the swipe it's teaching passes straight
// through to the pager. `onDismiss` fires on the auto fade-out; the pager also
// dismisses it on the first tap/swipe.
export function LibrarySwipeHint({ onDismiss }: { onDismiss: () => void }) {
  // Master fade for the whole overlay (and the auto-dismiss trigger).
  const master = useSharedValue(0);
  // Looping 0→1 driver for the hand motion.
  const progress = useSharedValue(0);

  useEffect(() => {
    master.value = withSequence(
      withTiming(1, { duration: 300 }),
      withDelay(
        VISIBLE_MS,
        withTiming(0, { duration: 350 }, (finished) => {
          if (finished) runOnJS(onDismiss)();
        }),
      ),
    );
    progress.value = withRepeat(
      withTiming(1, { duration: CYCLE_MS, easing: Easing.linear }),
      -1,
      false,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const overlayStyle = useAnimatedStyle(() => ({ opacity: master.value }));

  // The hand + dot group: fades in, slides right→left, fades out, then resets
  // while invisible.
  const groupStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const translateX = interpolate(
      p,
      [0, 0.15, 0.6, 0.7, 1],
      [SWIPE, SWIPE, -SWIPE, -SWIPE, SWIPE],
    );
    const opacity = interpolate(p, [0, 0.12, 0.6, 0.72, 1], [0, 1, 1, 0, 0]);
    return { opacity, transform: [{ translateX }] };
  });

  // The touch-dot presses down (scales up + brightens) as the swipe starts and
  // lifts at the end.
  const dotStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const scale = interpolate(
      p,
      [0, 0.1, 0.16, 0.58, 0.66],
      [0.55, 0.55, 1, 1, 0.55],
    );
    const opacity = interpolate(
      p,
      [0, 0.1, 0.16, 0.58, 0.66],
      [0.15, 0.15, 0.4, 0.4, 0.15],
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, overlayStyle]}
      className="items-center justify-center bg-black/30"
    >
      <Animated.View style={groupStyle} className="items-center justify-center">
        {/* Translucent white touch ripple. */}
        <Animated.View
          style={dotStyle}
          className="w-16 h-16 rounded-full bg-white border border-white/40"
        />
        {/* Pointing finger sits over the dot as the touch point. */}
        <View
          style={StyleSheet.absoluteFill}
          className="items-center justify-center"
        >
          <Icon icon={Pointer} size={28} color="#ffffff" />
        </View>
      </Animated.View>
      <Text className="text-white/85 text-sm font-medium mt-4">
        Swipe to switch
      </Text>
    </Animated.View>
  );
}
