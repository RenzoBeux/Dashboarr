import { View, Text, ActivityIndicator, Platform } from "react-native";
import { useUiScale } from "@/hooks/use-ui-scale";

interface CheckingIndicatorProps {
  label?: string;
  color?: string;
}

// Inline "determining status" indicator: a spinner + a short label, shown in a
// card/title header while a connectivity or health probe is in flight (#196).
//
// Deliberately uses React Native's NATIVE ActivityIndicator, NOT the reanimated
// `Spinner`. The whole point of this issue is that the reanimated loader sat
// FROZEN on a real iPhone (the original "spinner don't spin" report) and never
// reliably animated even after the ReduceMotion.Never patch: a multi-second
// pull-to-refresh window showed no visible motion. ActivityIndicator is drawn
// and animated by the OS, so it always spins on iOS regardless of Reduce Motion,
// Low Power Mode, or the New Architecture. The "Checking…" text is the belt to
// that suspenders: even in a worst case the state is still legible.
export function CheckingIndicator({
  label = "Checking…",
  color = "#a1a1aa",
}: CheckingIndicatorProps) {
  const scale = useUiScale();
  return (
    <View className="flex-row items-center gap-1.5">
      <ActivityIndicator
        // iOS clamps numeric sizes to small/large, so use "small" there; on
        // Android pass a scaled pixel size so the glyph tracks the UI-scale
        // setting like the rem-based "Checking…" text beside it.
        size={Platform.OS === "android" ? Math.round(16 * scale) : "small"}
        color={color}
      />
      <Text className="text-zinc-400 text-xs">{label}</Text>
    </View>
  );
}
