import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NativeSyntheticEvent, TextLayoutEventData } from "react-native";
import { lightHaptic } from "@/lib/haptics";

interface ExpandableTextProps {
  text: string;
  numberOfLines?: number;
  className?: string;
}

// Renders text once unconstrained to measure total line count, then collapses
// to `numberOfLines` and shows a "Read more" toggle if the text exceeds it.
// First paint shows the full text briefly — acceptable for detail screens
// where the alternative (hidden + measure pass + reveal) introduces flicker
// just to avoid a tiny one.
export function ExpandableText({
  text,
  numberOfLines = 4,
  className = "",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);
  const [measured, setMeasured] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);

  const handleLayout = (e: NativeSyntheticEvent<TextLayoutEventData>) => {
    if (measured) return;
    setMeasured(true);
    if (e.nativeEvent.lines.length > numberOfLines) {
      setNeedsToggle(true);
    }
  };

  return (
    <View>
      <Text
        className={`text-zinc-300 text-sm leading-5 ${className}`}
        numberOfLines={!measured || expanded ? undefined : numberOfLines}
        onTextLayout={handleLayout}
      >
        {text}
      </Text>
      {needsToggle ? (
        <Pressable
          onPress={() => {
            lightHaptic();
            setExpanded(!expanded);
          }}
          hitSlop={6}
          className="mt-1.5 active:opacity-60 self-start"
        >
          <Text className="text-primary text-xs font-semibold">
            {expanded ? "Show less" : "Read more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
