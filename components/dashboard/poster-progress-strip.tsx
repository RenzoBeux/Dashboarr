import { View } from "react-native";
import { StatusFill } from "@/components/ui/status-fill";

interface PosterProgressStripProps {
  progress: number;
  color?: string;
  /** Dashed fill: the *arr is holding the release, not downloading it yet (#484). */
  held?: boolean;
}

export function PosterProgressStrip({
  progress,
  color = "#3b82f6",
  held = false,
}: PosterProgressStripProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View
      style={{
        height: 3,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
      }}
    >
      <StatusFill
        color={color}
        held={held}
        style={{ height: "100%", width: `${clamped * 100}%` }}
      />
    </View>
  );
}
