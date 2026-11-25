import { useEffect } from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  Text,
  View,
} from "react-native";
import { lightHaptic } from "@/lib/haptics";

// Wait for typing to settle before speaking a count, so a screen reader reads
// the final result once instead of every intermediate one.
const ANNOUNCE_DELAY_MS = 600;

/**
 * What a library search found, between the search field and the list: the
 * result count, and when the screen's filters hide some matches, a hint with
 * a one-tap "Show all" (NN/g scoped search: always offer a way to widen the
 * scope). Renders nothing without a query.
 */
export function LibrarySearchStatus({
  query,
  shown,
  total,
  hidden,
  nounPlural,
  onShowAll,
}: {
  query: string;
  shown: number;
  total: number;
  hidden: number;
  nounPlural: string;
  onShowAll: () => void;
}) {
  const active = query.trim().length > 0;
  const count = `${shown} of ${total} ${nounPlural}`;
  const hint = `${hidden} ${hidden === 1 ? "match" : "matches"} hidden by filters`;

  // Android reads the live region below; iOS has no live regions, so the
  // count is announced instead (WCAG 4.1.3, status messages).
  useEffect(() => {
    if (!active || Platform.OS !== "ios") return;
    const id = setTimeout(() => {
      AccessibilityInfo.announceForAccessibility(
        hidden > 0 ? `${count}. ${hint}` : count,
      );
    }, ANNOUNCE_DELAY_MS);
    return () => clearTimeout(id);
  }, [active, count, hint, hidden]);

  if (!active) return null;
  return (
    <View accessibilityLiveRegion="polite">
      <Text className="text-zinc-500 text-xs mb-2">{count}</Text>
      {hidden > 0 ? (
        <View className="flex-row items-center gap-3 mb-3 pl-3.5 pr-1.5 py-1.5 rounded-2xl bg-amber-500/10 border border-dashed border-amber-500/40">
          <Text className="flex-1 text-amber-300 text-sm">{hint}</Text>
          <Pressable
            onPress={() => {
              lightHaptic();
              onShowAll();
            }}
            hitSlop={6}
            className="px-3 py-1.5 rounded-full bg-amber-600 active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={`Show all ${nounPlural}, clearing the filters`}
          >
            <Text className="text-white text-xs font-semibold">Show all</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
