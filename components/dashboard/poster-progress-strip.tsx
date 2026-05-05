import { View } from "react-native";

interface PosterProgressStripProps {
  progress: number;
  color?: string;
}

export function PosterProgressStrip({
  progress,
  color = "#3b82f6",
}: PosterProgressStripProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{
        height: 3,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
      }}
    >
      <View
        style={{
          height: "100%",
          width: `${clamped * 100}%`,
          backgroundColor: color,
        }}
      />
    </View>
  );
}
