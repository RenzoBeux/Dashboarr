import { useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import Animated, {
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

// Above this many segments the equal-width slots get too narrow for their
// labels ("Transmission" at text-sm already fills a quarter-width slot on a
// 390pt screen, and every label grows with uiScale). Past the threshold the row
// becomes a horizontal ScrollView of intrinsically-sized segments so nothing
// clips and every segment stays reachable — the same rule the FilterChip rows
// follow. At or below it the control keeps its full-width look.
const DEFAULT_SCROLL_THRESHOLD = 3;

/**
 * Pill-style segmented control (Library Movies/TV, Downloads clients, Bazarr
 * Library/History).
 *
 * `progress` is an optional fractional index of the active segment (0 = first,
 * 1 = second, 0.5 = halfway). When given, the highlight is a pill that slides
 * with it, so a swipeable pager can drive the header in lockstep with the
 * swipe. Without it the active segment simply gets the fill. The sliding pill
 * needs equal-width segments, so it only applies while the row isn't
 * scrolling.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  scrollThreshold = DEFAULT_SCROLL_THRESHOLD,
  progress,
  screenInset = false,
  className = "",
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (next: T) => void;
  // Freezes switching (the inactive segments), e.g. while an add is in flight.
  disabled?: boolean;
  scrollThreshold?: number;
  progress?: SharedValue<number>;
  // Inset the control by the screen gutter (px-4). Used where the control sits
  // outside ScreenWrapper's own padding; the scrolling variant applies it as
  // content padding so segments can scroll edge to edge.
  screenInset?: boolean;
  // Vertical margins and similar outer spacing.
  className?: string;
}) {
  const fill = options.length <= scrollThreshold;
  const sliding = fill && progress !== undefined;

  const segments = options.map((o) => (
    <Segment
      key={o.value}
      label={o.label}
      active={value === o.value}
      onPress={() => onChange(o.value)}
      fill={fill}
      // With a sliding pill the highlight lives behind the labels.
      highlight={!sliding}
      disabled={disabled && value !== o.value}
    />
  ));

  if (!fill) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className={className}
        contentContainerClassName={screenInset ? "px-4" : undefined}
      >
        <View className="flex-row bg-surface-light rounded-2xl p-1">{segments}</View>
      </ScrollView>
    );
  }

  return (
    <View
      className={`bg-surface-light rounded-2xl p-1 ${screenInset ? "mx-4" : ""} ${className}`}
    >
      {sliding ? (
        <SlidingTrack count={options.length} progress={progress}>
          {segments}
        </SlidingTrack>
      ) : (
        <View className="flex-row">{segments}</View>
      )}
    </View>
  );
}

function SlidingTrack({
  count,
  progress,
  children,
}: {
  count: number;
  progress: SharedValue<number>;
  children: React.ReactNode;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  const segWidth = count > 0 ? trackWidth / count : 0;

  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * segWidth }],
  }));

  return (
    <View
      className="flex-row"
      onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
    >
      {segWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", top: 0, bottom: 0, left: 0, width: segWidth },
            pillStyle,
          ]}
          className="bg-surface rounded-xl"
        />
      ) : null}
      {children}
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
  fill,
  highlight,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  // Split the row evenly (few segments) vs size to the label (scrolling row).
  fill: boolean;
  highlight: boolean;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="tab"
      accessibilityState={{ selected: active, disabled }}
      className={`py-2 rounded-xl items-center active:opacity-70 ${fill ? "flex-1" : "px-4"} ${
        active && highlight ? "bg-surface" : ""
      } ${disabled ? "opacity-40" : ""}`}
    >
      <Text
        className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
