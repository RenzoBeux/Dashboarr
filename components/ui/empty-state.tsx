import { View, Text } from "react-native";
import Animated, { BounceIn, FadeIn } from "react-native-reanimated";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
  /**
   * Renders a thin single-line variant (no icon circle, minimal padding).
   * Use inside dashboard widgets so they collapse instead of taking a full
   * card's worth of vertical space when there's no data.
   */
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className = "",
  compact = false,
}: EmptyStateProps) {
  if (compact) {
    return (
      <Animated.View
        entering={FadeIn.duration(200)}
        className={`items-center justify-center py-2 px-4 ${className}`}
      >
        <Text className="text-zinc-500 text-sm text-center">{title}</Text>
        {message && (
          <Text className="text-zinc-600 text-xs text-center mt-0.5">
            {message}
          </Text>
        )}
        {action && <View className="mt-2">{action}</View>}
      </Animated.View>
    );
  }

  return (
    <View className={`items-center justify-center py-8 px-4 ${className}`}>
      {icon && (
        <Animated.View entering={BounceIn.duration(600)} className="mb-3">
          <View className="w-16 h-16 rounded-full bg-surface-light items-center justify-center">
            {icon}
          </View>
        </Animated.View>
      )}
      <Animated.View entering={FadeIn.delay(200)}>
        <Text className="text-zinc-400 text-base font-medium text-center">
          {title}
        </Text>
      </Animated.View>
      {message && (
        <Animated.View entering={FadeIn.delay(350)}>
          <Text className="text-zinc-500 text-sm text-center mt-1">
            {message}
          </Text>
        </Animated.View>
      )}
      {action && <View className="mt-4">{action}</View>}
    </View>
  );
}
