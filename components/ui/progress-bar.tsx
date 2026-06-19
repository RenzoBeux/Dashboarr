import { View, Text } from "react-native";

interface ProgressBarProps {
  progress: number; // 0-1
  showLabel?: boolean;
  /** Tailwind class for the fill (e.g. "bg-primary"). Ignored when `fillColor` is set. */
  color?: string;
  /**
   * Explicit fill color as a hex/rgb string. Use this for status colors derived
   * at runtime (e.g. the purple downloading indicator) so the fill never depends
   * on a Tailwind class being present in the build. Overrides `color`.
   */
  fillColor?: string;
  className?: string;
}

export function ProgressBar({
  progress,
  showLabel = false,
  color = "bg-primary",
  fillColor,
  className = "",
}: ProgressBarProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const percentage = Math.round(clampedProgress * 100);

  return (
    <View className={`flex-row items-center gap-2 ${className}`}>
      <View className="flex-1 h-2 bg-zinc-700 rounded-full overflow-hidden">
        <View
          className={`h-full rounded-full ${fillColor ? "" : color}`}
          style={{
            width: `${percentage}%`,
            ...(fillColor ? { backgroundColor: fillColor } : null),
          }}
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
