import { useState } from "react";
import {
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useUiScale } from "@/hooks/use-ui-scale";

// Dash geometry (dp at uiScale 1.0; multiplied by uiScale at render).
const DASH = 4;
const GAP = 3;

interface StatusFillProps {
  /** Fill color as a hex string (a BAR_KIND_COLOR / DOWNLOAD_INDICATOR_COLOR value). */
  color: string;
  /**
   * Draw the fill as dashes instead of solid: the *arr is still holding the
   * release itself (delay profile / client unavailable), so nothing is
   * downloading yet (issue #484, see isHeldQueueRecord).
   */
  held?: boolean;
  /** Dashes run top to bottom (a spine) instead of left to right (a bar). */
  vertical?: boolean;
  className?: string;
  style?: StyleProp<ViewStyle>;
}

/**
 * A status bar/spine fill, solid or dashed. Not held, it is exactly the plain
 * colored View every surface drew before, so it drops in for one. Held, the
 * same box holds a row (or column) of colored dashes with transparent gaps, so
 * whatever track sits behind it shows through.
 *
 * Static on purpose: no animation to stop under OS Reduce Motion, and nothing
 * running per tile in a long poster grid. Only a held fill measures itself, so
 * the common solid case costs no extra layout pass.
 */
export function StatusFill({
  color,
  held = false,
  vertical = false,
  className,
  style,
}: StatusFillProps) {
  const scale = useUiScale();
  const [length, setLength] = useState(0);

  // The two branches carry distinct keys so turning held remounts the box:
  // onLayout only fires on mount or a layout change, and an item going from a
  // solid bar to a held one keeps the exact same frame.
  if (!held) {
    return (
      <View
        key="solid"
        className={className}
        style={[{ backgroundColor: color }, style]}
      />
    );
  }

  const dash = Math.max(2, Math.round(DASH * scale));
  const gap = Math.max(2, Math.round(GAP * scale));
  // One spare dash so a sub-pixel remainder never leaves the far end bare; the
  // overflow is clipped.
  const count = length > 0 ? Math.ceil(length / (dash + gap)) + 1 : 0;

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const next = Math.round(vertical ? height : width);
    if (next !== length) setLength(next);
  };

  return (
    <View
      key="held"
      className={className}
      style={[
        { flexDirection: vertical ? "column" : "row", overflow: "hidden" },
        style,
      ]}
      onLayout={onLayout}
    >
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={
            vertical
              ? { height: dash, marginBottom: gap, backgroundColor: color }
              : { width: dash, marginRight: gap, backgroundColor: color }
          }
        />
      ))}
    </View>
  );
}
