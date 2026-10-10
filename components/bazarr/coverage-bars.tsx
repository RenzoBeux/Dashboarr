import { View, Text, Pressable, ScrollView } from "react-native";
import { Captions } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { normalizeLanguage } from "@/lib/language-codes";
import type { LanguageCoverage } from "@/lib/bazarr-library";

/**
 * Per-language coverage across the movie library, one compact bar per
 * language a profile asks for. Tapping a bar shows only the movies missing
 * that language; tapping it again clears the filter.
 */
export function CoverageBars({
  coverage,
  selected,
  onSelect,
}: {
  coverage: readonly LanguageCoverage[];
  selected: string | null;
  onSelect: (code2: string | null) => void;
}) {
  if (coverage.length === 0) return null;
  return (
    <View className="flex-row items-center rounded-xl bg-surface border border-border mb-3 pl-2.5">
      <Icon icon={Captions} size={14} color="#71717a" />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-1 px-1.5 py-1.5"
      >
        {coverage.map((c) => {
          const pct = c.total > 0 ? Math.round((c.have / c.total) * 100) : 0;
          const isSelected = selected === c.code2;
          const name = normalizeLanguage(c.code2)?.name ?? c.code2;
          return (
            <Pressable
              key={c.code2}
              onPress={() => onSelect(isSelected ? null : c.code2)}
              className={`flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 active:opacity-70 ${
                isSelected ? "bg-orange-400/15" : ""
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              accessibilityLabel={`${name}: ${c.have} of ${c.total} movies. ${
                isSelected ? "Showing movies missing it; tap to clear" : "Tap to show movies missing it"
              }`}
            >
              <SubtitleTrackChip code={c.code2} state="present" size="sm" />
              <View className="w-10 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <View className="h-full bg-primary" style={{ width: `${pct}%` }} />
              </View>
              <Text className={`text-xs ${isSelected ? "text-orange-400" : "text-zinc-400"}`}>
                {pct}%
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
