import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/**
 * A Card whose body folds away behind a chevron header (season lists,
 * subtitle summaries, coverage grids).
 *
 * Layout: header row (chevron + title, optional `right` slot that is NOT part
 * of the toggle target so its own buttons stay tappable), then an always
 * visible `summary` (a progress bar, chip row, …), then `children` only while
 * expanded.
 *
 * Uncontrolled by default (`defaultExpanded`); pass `expanded` + `onToggle`
 * to control it from outside.
 */
export function CollapsibleCard({
  title,
  right,
  summary,
  children,
  expanded: expandedProp,
  defaultExpanded = false,
  onToggle,
  accessibilityLabel,
  className,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  summary?: React.ReactNode;
  children?: React.ReactNode;
  expanded?: boolean;
  defaultExpanded?: boolean;
  onToggle?: (next: boolean) => void;
  accessibilityLabel?: string;
  className?: string;
}) {
  const [expandedState, setExpandedState] = useState(defaultExpanded);
  const expanded = expandedProp ?? expandedState;

  const toggle = () => {
    const next = !expanded;
    if (expandedProp === undefined) setExpandedState(next);
    onToggle?.(next);
  };

  return (
    <Card className={className}>
      <View className="flex-row items-center justify-between">
        <Pressable
          onPress={toggle}
          hitSlop={4}
          className="flex-row items-center gap-2 flex-1 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          accessibilityState={{ expanded }}
        >
          <Icon
            icon={expanded ? ChevronDown : ChevronRight}
            size={16}
            color="#71717a"
          />
          {typeof title === "string" ? (
            <Text className="text-zinc-200 text-sm font-medium">{title}</Text>
          ) : (
            title
          )}
        </Pressable>
        {right}
      </View>
      {summary}
      {expanded ? children : null}
    </Card>
  );
}
