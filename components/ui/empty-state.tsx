import { View, Text } from "react-native";
import Animated, { BounceIn, FadeIn } from "react-native-reanimated";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className = "",
}: EmptyStateProps) {
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
