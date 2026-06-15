import { useEffect } from "react";
import { Platform } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";
import type { HealthStatusKind } from "@/lib/types";

// The one status dot used across every surface that shows service health —
// the dashboard Services widget, the Services tab, the service-screen header,
// the Settings instance list, and the Prowlarr indexer chips. Keeps
// "green/orange/red" meaning the same thing everywhere instead of each surface
// hand-rolling its own copy of the palette + circle.
//
// Adds a "checking" state on top of the tri-state health kind: a pulsing
// neutral dot shown while the health probe batch is still settling, so a cold
// start reads as "determining" instead of a wall of red that looks like an
// outage (#196).
export type StatusDotState = HealthStatusKind | "checking";

const DOT_BG: Record<StatusDotState, string> = {
  ok: "bg-success",
  auth_failed: "bg-warning",
  offline: "bg-danger",
  checking: "bg-zinc-500",
};

// iOS glow color per settled state — the checking state pulses instead of
// glowing, so it isn't keyed here.
const DOT_SHADOW: Record<HealthStatusKind, string> = {
  ok: "#22c55e",
  auth_failed: "#f59e0b",
  offline: "#ef4444",
};

// Standard Tailwind size tokens (rem-based, so they scale with the UI scale
// setting). Matches the four sizes the surfaces use today.
type StatusDotSize = "xs" | "sm" | "md" | "lg";
const DOT_SIZE: Record<StatusDotSize, string> = {
  xs: "w-1.5 h-1.5",
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
  lg: "w-3 h-3",
};

interface StatusDotProps {
  state: StatusDotState;
  // Dot diameter. Defaults to "lg" (the dashboard/Services-grid size).
  size?: StatusDotSize;
  // Render as an absolutely-positioned top-right corner badge with a
  // surface-colored ring — for dots overlaid on a service logo (the grids).
  // Inline dots (headers, list rows) leave this off.
  overlay?: boolean;
  // iOS glow halo behind the dot. Never applied to the checking state.
  shadow?: boolean;
  // Extra classes for layout-specific spacing (e.g. "mr-2").
  className?: string;
}

export function StatusDot({
  state,
  size = "lg",
  overlay = false,
  shadow = false,
  className = "",
}: StatusDotProps) {
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (state === "checking") {
      pulse.value = withRepeat(
        withSequence(
          withTiming(0.35, { duration: 650, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 650, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = 1;
    }
    return () => cancelAnimation(pulse);
  }, [state, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const classes = [
    "rounded-full",
    DOT_SIZE[size],
    DOT_BG[state],
    overlay ? "absolute -top-0.5 -right-0.5 border-2 border-surface" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <Animated.View
      pointerEvents="none"
      className={classes}
      style={[
        state === "checking" ? pulseStyle : undefined,
        shadow && state !== "checking" && Platform.OS === "ios"
          ? {
              shadowColor: DOT_SHADOW[state],
              shadowRadius: 6,
              shadowOpacity: 0.6,
              shadowOffset: { width: 0, height: 0 },
            }
          : undefined,
      ]}
    />
  );
}
