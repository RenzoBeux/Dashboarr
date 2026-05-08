import type { ComponentType } from "react";
import { Pressable, Text, View, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { Icon } from "@/components/ui/icon";
import { lightHaptic } from "@/lib/haptics";

const SPRING_CONFIG = { damping: 15, stiffness: 200 };

export interface MediaActionItem {
  key: string;
  icon: ComponentType<any>;
  label?: string;
  active?: boolean;
  loading?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

interface MediaActionBarProps {
  actions: MediaActionItem[];
  className?: string;
}

export function MediaActionBar({ actions, className = "" }: MediaActionBarProps) {
  return (
    <View className={`flex-row gap-2 ${className}`}>
      {actions.map(({ key, ...rest }) => (
        <ActionPill key={key} {...rest} />
      ))}
    </View>
  );
}

function ActionPill({
  icon,
  label,
  active = false,
  loading = false,
  disabled = false,
  onPress,
}: Omit<MediaActionItem, "key">) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const surfaceClasses = active
    ? "bg-primary/20 border-primary/50"
    : "bg-surface border-border/40";
  const iconColor = active ? "#60a5fa" : "#e4e4e7";
  const textColor = active ? "text-primary" : "text-zinc-400";

  return (
    <Animated.View style={animatedStyle} className="flex-1">
      <Pressable
        onPress={() => {
          if (disabled || loading) return;
          lightHaptic();
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.95, SPRING_CONFIG);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_CONFIG);
        }}
        disabled={disabled || loading}
        className={`items-center justify-center rounded-2xl border py-3 ${surfaceClasses} ${disabled ? "opacity-50" : ""}`}
      >
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : (
          <Icon icon={icon} size={20} color={iconColor} fill={active ? iconColor : "transparent"} />
        )}
        {label ? (
          <Text
            className={`text-[0.65rem] font-semibold mt-1 ${textColor}`}
            numberOfLines={1}
          >
            {label}
          </Text>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}
