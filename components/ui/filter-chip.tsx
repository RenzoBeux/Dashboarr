import { Pressable, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

const SPRING_CONFIG = { damping: 15, stiffness: 200 };

interface FilterChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
}

export function FilterChip({ label, selected, onPress, icon }: FilterChipProps) {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPress={onPress}
        onPressIn={() => {
          scale.value = withSpring(0.95, SPRING_CONFIG);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_CONFIG);
        }}
        hitSlop={4}
        className={`flex-row items-center gap-1.5 px-3.5 py-2 rounded-full ${
          selected ? "bg-primary" : "bg-surface-light"
        }`}
      >
        {icon}
        <Text
          className={`text-sm font-medium ${
            selected ? "text-white" : "text-zinc-400"
          }`}
        >
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
