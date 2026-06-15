import { useEffect } from "react";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import { Loader2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

interface SpinnerProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

// Small inline spinner — a continuously rotating Loader2. Same rotation timing
// as ProgressModal's spinner so loading motion feels consistent app-wide, but
// scoped to an inline glyph (next to a title, in a row) rather than a modal.
// Sizes through the Icon wrapper so it respects the global UI scale setting.
export function Spinner({
  size = 16,
  color = "#a1a1aa",
  strokeWidth = 2.25,
}: SpinnerProps) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 1100, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(rotation);
  }, [rotation]);

  const style = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <Animated.View style={style}>
      <Icon icon={Loader2} size={size} color={color} strokeWidth={strokeWidth} />
    </Animated.View>
  );
}
