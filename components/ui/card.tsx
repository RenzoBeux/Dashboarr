import { View, Pressable, Text } from "react-native";
import type { ViewProps } from "react-native";

interface CardProps extends ViewProps {
  onPress?: () => void;
}

export function Card({ className = "", onPress, children, ...props }: CardProps) {
  const baseClasses = `bg-surface rounded-2xl p-4 border border-border ${className}`;

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        className={`${baseClasses} active:opacity-80`}
        {...props}
      >
        {children}
      </Pressable>
    );
  }

  return (
    <View className={baseClasses} {...props}>
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
