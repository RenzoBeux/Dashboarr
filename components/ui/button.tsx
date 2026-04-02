import { Pressable, Text, ActivityIndicator } from "react-native";

type ButtonVariant = "primary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, { container: string; text: string }> = {
  primary: {
    container: "bg-primary",
    text: "text-white",
  },
  ghost: {
    container: "bg-transparent",
    text: "text-zinc-300",
  },
  danger: {
    container: "bg-danger",
    text: "text-white",
  },
  outline: {
    container: "bg-transparent border border-border",
    text: "text-zinc-300",
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
  const variantStyle = VARIANT_CLASSES[variant];
  const sizeStyle = SIZE_CLASSES[size];

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      className={`flex-row items-center justify-center ${sizeStyle.container} ${variantStyle.container} ${disabled ? "opacity-50" : "active:opacity-80"} ${className}`}
    >
      {loading ? (
        <ActivityIndicator size="small" color="white" />
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
  );
}
