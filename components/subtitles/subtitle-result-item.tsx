import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import { Check, ChevronRight, X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { normalizeLanguage } from "@/lib/language-codes";
import type { BazarrSubtitleResult } from "@/lib/types";

/** Bazarr scores manual results as a percentage of the best possible match. */
export function scoreTone(score: number): { box: string; text: string } {
  if (score >= 90) return { box: "bg-emerald-500/15", text: "text-emerald-300" };
  if (score >= 70) return { box: "bg-zinc-700", text: "text-zinc-200" };
  return { box: "bg-orange-400/15", text: "text-orange-300" };
}

export function ScoreBadge({ score }: { score: number }) {
  const tone = scoreTone(score);
  return (
    <View className={`rounded-md px-1.5 py-0.5 ${tone.box}`}>
      <Text className={`text-xs font-bold ${tone.text}`}>{Math.round(score)}%</Text>
    </View>
  );
}

export const resultKey = (r: BazarrSubtitleResult) => `${r.provider}:${r.subtitle}`;

/**
 * One manual-search candidate: release name, language chip with its flags,
 * score, provider, and how many attributes matched / didn't.
 */
function SubtitleResultItemImpl({
  result,
  onSelect,
}: {
  result: BazarrSubtitleResult;
  onSelect: (r: BazarrSubtitleResult) => void;
}) {
  const lang = normalizeLanguage(result.language);
  const release = result.release_info[0] ?? "Unnamed release";
  const more = result.release_info.length - 1;
  return (
    <Pressable
      onPress={() => onSelect(result)}
      className="bg-surface rounded-2xl border border-border p-3 mb-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${lang?.name ?? result.language} subtitle from ${result.provider}, ${Math.round(result.score)} percent match`}
    >
      <View className="flex-row items-start gap-2">
        <Text className="flex-1 text-zinc-100 text-sm font-medium leading-5" numberOfLines={2}>
          {release}
          {more > 0 ? <Text className="text-zinc-500"> +{more}</Text> : null}
        </Text>
        <Icon icon={ChevronRight} size={16} color="#71717a" />
      </View>
      <View className="flex-row items-center flex-wrap gap-2.5 mt-2.5 pt-1">
        <SubtitleTrackChip
          code={result.language}
          name={lang?.name}
          state="present"
          forced={result.forced === "True"}
          hi={result.hearing_impaired === "True"}
          size="sm"
        />
        <ScoreBadge score={result.score} />
        <Text className="text-zinc-500 text-xs">{result.provider}</Text>
      </View>
      <View className="flex-row items-center gap-1.5 mt-1.5">
        <Icon icon={Check} size={12} color="#34d399" />
        <Text className="text-zinc-400 text-xs">{result.matches.length}</Text>
        {result.dont_matches.length > 0 ? (
          <>
            <Icon icon={X} size={12} color="#f87171" />
            <Text className="text-zinc-400 text-xs">{result.dont_matches.length}</Text>
          </>
        ) : null}
        {result.uploader ? (
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {"  "}
            {result.uploader}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// Structural sharing keeps unchanged results the same object across
// refetches, so the default shallow compare skips them without going stale.
export const SubtitleResultItem = memo(SubtitleResultItemImpl);
