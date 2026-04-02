import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={className}
      style={{
        width: width as any,
        height,
        borderRadius,
        backgroundColor: "#27272a",
        opacity,
      }}
    />
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
