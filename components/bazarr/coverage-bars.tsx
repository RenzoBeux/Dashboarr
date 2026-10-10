import { View, Text, Pressable, ScrollView } from "react-native";
import { Captions } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { normalizeLanguage } from "@/lib/language-codes";
import {
  nextLanguageFilter,
  type LanguageCoverage,
  type LanguageFilter,
} from "@/lib/bazarr-library";

/**
 * Per-language coverage across the movie library, one compact bar per
 * language a profile asks for. Taps cycle a bar through three filters: the
 * movies missing the language (the chip turns into the dashed "missing"
 * chip), the movies that have it, then off. The label says which is on.
 */
export function CoverageBars({
  coverage,
  selected,
  onSelect,
}: {
  coverage: readonly LanguageCoverage[];
  selected: LanguageFilter | null;
  onSelect: (filter: LanguageFilter | null) => void;
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
          const show = selected?.code2 === c.code2 ? selected.show : null;
          const name = normalizeLanguage(c.code2)?.name ?? c.code2;
          const label =
            show === "missing"
              ? `${c.total - c.have} missing`
              : show === "have"
                ? `${c.have} have it`
                : `${pct}%`;
          const now =
            show === "missing"
              ? "Showing movies missing it; tap to show movies that have it"
              : show === "have"
                ? "Showing movies that have it; tap to clear"
                : "Tap to show movies missing it";
          return (
            <Pressable
              key={c.code2}
              onPress={() => onSelect(nextLanguageFilter(selected, c.code2))}
              className={`flex-row items-center gap-1.5 rounded-lg px-2 py-1.5 active:opacity-70 ${
                show === "missing"
                  ? "bg-orange-400/15"
                  : show === "have"
                    ? "bg-blue-400/15"
                    : ""
              }`}
              accessibilityRole="button"
              accessibilityState={{ selected: show != null }}
              accessibilityLabel={`${name}: ${c.have} of ${c.total} movies. ${now}`}
            >
              <SubtitleTrackChip
                code={c.code2}
                state={show === "missing" ? "missing" : "present"}
                size="sm"
              />
              <View className="w-10 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                <View
                  className="h-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </View>
              <Text
                className={`text-xs ${
                  show === "missing"
                    ? "text-orange-400"
                    : show === "have"
                      ? "text-blue-400"
                      : "text-zinc-400"
                }`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}
