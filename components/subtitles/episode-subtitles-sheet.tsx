import { View, Text, Pressable } from "react-native";
import { ChevronLeft, ChevronRight, Volume2 } from "lucide-react-native";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { Icon } from "@/components/ui/icon";
import { AudioLanguagePill } from "@/components/subtitles/subtitle-track-chip";
import { SubtitlesBlock } from "@/components/subtitles/subtitles-block";
import type { AudioTag, SubtitleRow } from "@/lib/subtitle-model";

type BlockProps = Omit<
  React.ComponentProps<typeof SubtitlesBlock>,
  "rows" | "hideProfile" | "tone"
>;

/**
 * One episode's subtitles in a sheet: its audio languages, the shared
 * SubtitlesBlock, and buttons to step to the previous / next episode that
 * still misses a language — so a season's gaps can be worked through without
 * closing the sheet.
 *
 * Opens from the episode row's subtitle line, a coverage-grid cell, or the
 * episode "⋯" menu. It is the `host` step of the screen's useSubtitleActions
 * flow, so a row's menu opens only once this sheet has closed.
 */
export function EpisodeSubtitlesSheet({
  visible,
  onClose,
  onClosed,
  code,
  title,
  mediaLine,
  audio,
  rows,
  blockProps,
  prevGap,
  nextGap,
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  // "S01E02"
  code: string;
  title: string;
  // "1080p · x264 · EAC3 5.1", when the file's media info is known.
  mediaLine?: string;
  audio: readonly AudioTag[];
  rows: readonly SubtitleRow[];
  blockProps: BlockProps;
  prevGap?: { label: string; onPress: () => void } | null;
  nextGap?: { label: string; onPress: () => void } | null;
}) {
  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      header={
        <SheetTitleRow
          title={`${code} subtitles`}
          subtitle={[title, mediaLine].filter(Boolean).join(" · ")}
          onClose={onClose}
        />
      }
    >
      <View className="rounded-2xl bg-surface-light overflow-hidden">
        {audio.length > 0 ? (
          <View
            className="flex-row items-center flex-wrap gap-2.5 px-4 pt-3 pb-2.5"
            accessible
            accessibilityLabel={`Audio: ${audio.map((a) => a.name + (a.original ? " (original)" : "")).join(", ")}`}
          >
            <Icon icon={Volume2} size={14} color="#71717a" />
            {audio.map((a) => (
              <AudioLanguagePill
                key={a.code2}
                code={a.code2}
                name={a.name}
                original={a.original}
                size="sm"
                ringClassName="border-surface-light"
              />
            ))}
            {audio.length === 1 ? (
              <Text className="text-zinc-400 text-xs ml-1">
                {audio[0].name}
                {audio[0].original ? " · original" : ""}
              </Text>
            ) : null}
          </View>
        ) : null}
        <SubtitlesBlock rows={rows} {...blockProps} hideProfile tone="raised" />
      </View>

      {prevGap || nextGap ? (
        <View className="flex-row gap-2 mt-4">
          <GapButton direction="prev" gap={prevGap} />
          <GapButton direction="next" gap={nextGap} />
        </View>
      ) : null}
    </BottomSheet>
  );
}

function GapButton({
  direction,
  gap,
}: {
  direction: "prev" | "next";
  gap?: { label: string; onPress: () => void } | null;
}) {
  const prev = direction === "prev";
  return (
    <Pressable
      onPress={gap?.onPress}
      disabled={!gap}
      className={`flex-1 flex-row items-center justify-center gap-1 rounded-xl border border-border py-2.5 ${
        gap ? "active:opacity-70" : "opacity-40"
      }`}
      accessibilityRole="button"
      accessibilityLabel={
        prev ? "Previous episode with missing subtitles" : "Next episode with missing subtitles"
      }
    >
      {prev ? <Icon icon={ChevronLeft} size={14} color="#a1a1aa" /> : null}
      <Text className="text-zinc-300 text-xs font-semibold">
        {gap?.label ?? (prev ? "No earlier gaps" : "No later gaps")}
      </Text>
      {prev ? null : <Icon icon={ChevronRight} size={14} color="#a1a1aa" />}
    </Pressable>
  );
}
