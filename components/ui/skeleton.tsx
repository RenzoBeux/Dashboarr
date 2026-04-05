import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";

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

  useEffect(() => {
    translateX.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
    );
  }, [translateX]);

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value * 200 }],
  }));

  return (
    <View
      className={className}
      style={{
        width: width as any,
        height,
        borderRadius,
        backgroundColor: "#27272a",
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
            backgroundColor: "#3f3f46",
            borderRadius,
            opacity: 0.5,
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
