import { Pressable, Text, ActivityIndicator } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { lightHaptic } from "@/lib/haptics";
import { useThemeColor } from "@/hooks/use-theme-color";

const SPRING_CONFIG = { damping: 15, stiffness: 200 };

type ButtonVariant = "primary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

// `spinner` matches the label color: white on the solid fills, zinc-300 (run
// through the theme) on the transparent ones.
const VARIANT_CLASSES: Record<
  ButtonVariant,
  { container: string; text: string; spinner: string }
> = {
  primary: {
    container: "bg-primary",
    text: "text-white",
    spinner: "#ffffff",
  },
  ghost: {
    container: "bg-transparent",
    text: "text-zinc-300",
    spinner: "#d4d4d8",
  },
  danger: {
    container: "bg-danger",
    text: "text-white",
    spinner: "#ffffff",
  },
  outline: {
    container: "bg-transparent border border-border",
    text: "text-zinc-300",
    spinner: "#d4d4d8",
  },
};

const SIZE_CLASSES: Record<ButtonSize, { container: string; text: string }> = {
  sm: { container: "px-3 py-1.5 rounded-lg", text: "text-xs" },
  md: { container: "px-4 py-2.5 rounded-xl", text: "text-sm" },
  lg: { container: "px-6 py-3.5 rounded-xl", text: "text-base" },
};

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  className = "",
  icon,
}: ButtonProps) {
  const tc = useThemeColor();
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const variantStyle = VARIANT_CLASSES[variant];
  const sizeStyle = SIZE_CLASSES[size];

  return (
    <Animated.View style={animatedStyle} className={className}>
      <Pressable
        onPress={() => {
          lightHaptic();
          onPress();
        }}
        onPressIn={() => {
          scale.value = withSpring(0.97, SPRING_CONFIG);
        }}
        onPressOut={() => {
          scale.value = withSpring(1, SPRING_CONFIG);
        }}
        disabled={disabled || loading}
        className={`flex-row items-center justify-center ${sizeStyle.container} ${variantStyle.container} ${disabled ? "opacity-50" : ""}`}
      >
        {loading ? (
          <ActivityIndicator size="small" color={tc(variantStyle.spinner)} />
        ) : (
          <>
            {icon && <>{icon}</>}
            <Text
              className={`font-semibold ${sizeStyle.text} ${variantStyle.text} ${icon ? "ml-2" : ""}`}
            >
              {label}
            </Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}
