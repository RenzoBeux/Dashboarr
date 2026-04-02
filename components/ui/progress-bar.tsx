import { View, Text } from "react-native";

interface ProgressBarProps {
  progress: number; // 0-1
  showLabel?: boolean;
  color?: string;
  className?: string;
}

export function ProgressBar({
  progress,
  showLabel = false,
  color = "bg-primary",
  className = "",
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const percentage = Math.round(clampedProgress * 100);

  return (
    <View className={`flex-row items-center gap-2 ${className}`}>
      <View className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${color}`}
          style={{ width: `${percentage}%` }}
        />
      </View>
      {showLabel && (
        <Text className="text-zinc-400 text-xs w-10 text-right">
          {percentage}%
        </Text>
      )}
    </View>
  );
}
