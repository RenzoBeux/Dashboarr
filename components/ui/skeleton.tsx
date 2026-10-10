import { useEffect } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  ReduceMotion,
} from "react-native-reanimated";
import { useAppTheme } from "@/hooks/use-app-theme";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  className?: string;
}

export function Skeleton({
  width = "100%",
  height = 16,
  borderRadius = 8,
  className,
}: SkeletonProps) {
  const translateX = useSharedValue(-1);
  // Measured box width: the highlight (40% wide) travels from fully off the
  // left edge to fully off the right edge, whatever the skeleton's width. A
  // fixed pixel distance stopped short on wide boxes.
  const boxWidth = useSharedValue(0);
  const theme = useAppTheme();

  useEffect(() => {
    // ReduceMotion.Never: the shimmer is a loading affordance, so keep it moving
    // even with the OS "Reduce Motion" setting on (otherwise it sits as a static
    // bar). The 5th withRepeat arg governs whether the infinite repeat starts, so
    // the explicit reverse/callback slots are required to position it (#196).
    translateX.value = withRepeat(
      withTiming(1, {
        duration: 1200,
        easing: Easing.inOut(Easing.ease),
        reduceMotion: ReduceMotion.Never,
      }),
      -1,
      false,
      undefined,
      ReduceMotion.Never,
    );
  }, [translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    // Hidden until onLayout measures the box; at width 0 the mapping below
    // parks the highlight on the left edge for the first frame.
    opacity: boxWidth.value > 0 ? 0.5 : 0,
    // translateX runs -1 → 1; map it to -0.4w → w.
    transform: [
      {
        translateX:
          ((translateX.value + 1) / 2) * boxWidth.value * 1.4 -
          boxWidth.value * 0.4,
      },
    ],
  }));

  return (
    <View
      className={className}
      onLayout={(e: LayoutChangeEvent) => {
        boxWidth.value = e.nativeEvent.layout.width;
      }}
      style={{
        width: width as any,
        height,
        borderRadius,
        backgroundColor: theme.surfaceLight,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            bottom: 0,
            width: "40%",
            backgroundColor: theme.border,
            borderRadius,
          },
          shimmerStyle,
        ]}
      />
    </View>
  );
}

/** Skeleton that mimics a card row (icon + two lines of text) */
export function SkeletonRow() {
  return (
    <View className="flex-row items-center gap-3">
      <Skeleton width={14} height={14} borderRadius={7} />
      <View className="flex-1 gap-1.5">
        <Skeleton height={14} width="75%" />
        <Skeleton height={10} width="50%" />
      </View>
    </View>
  );
}

/** Skeleton that mimics a list of rows inside a card */
export function SkeletonCardContent({ rows = 3 }: { rows?: number }) {
  return (
    <View className="gap-3">
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </View>
  );
}
