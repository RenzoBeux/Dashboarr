import { View, Pressable, Text } from "react-native";
import type { StyleProp, ViewProps, ViewStyle } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = { damping: 15, stiffness: 200 };

const CARD_SHADOW: StyleProp<ViewStyle> = {
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.15,
  shadowRadius: 8,
  elevation: 3,
};

interface CardProps extends ViewProps {
  onPress?: () => void;
}

export function Card({ className = "", onPress, children, style, ...props }: CardProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const baseClasses = `bg-surface rounded-2xl p-4 border border-border ${className}`;

  if (onPress) {
    return (
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={onPress}
          onPressIn={() => {
            scale.value = withSpring(0.975, SPRING_CONFIG);
          }}
          onPressOut={() => {
            scale.value = withSpring(1, SPRING_CONFIG);
          }}
          className={baseClasses}
          style={[CARD_SHADOW, style]}
          {...props}
        >
          {children}
        </Pressable>
      </Animated.View>
    );
  }

  return (
    <View className={baseClasses} style={[CARD_SHADOW, style]} {...props}>
      {children}
    </View>
  );
}

export function CardHeader({
  className = "",
  children,
  ...props
}: ViewProps) {
  return (
    <View className={`flex-row items-center justify-between mb-3 ${className}`} {...props}>
      {children}
    </View>
  );
}

export function CardTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Text className={`text-zinc-100 text-base font-semibold ${className}`}>
      {children}
    </Text>
  );
}
