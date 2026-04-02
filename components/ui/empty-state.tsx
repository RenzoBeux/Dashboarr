import { View, Text } from "react-native";

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
      {icon && <View className="mb-3 opacity-50">{icon}</View>}
      <Text className="text-zinc-400 text-base font-medium text-center">
        {title}
      </Text>
      {message && (
        <Text className="text-zinc-500 text-sm text-center mt-1">
          {message}
        </Text>
      )}
      {action && <View className="mt-4">{action}</View>}
    </View>
  );
}
