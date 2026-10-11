import { useState } from "react";
import { View, Pressable } from "react-native";
import { Captions, Volume2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  AudioLanguagePill,
  MoreTagsChip,
  SubtitleTrackChip,
  TAG_WIDTH_REM,
  type TagSize,
} from "@/components/subtitles/subtitle-track-chip";
import { fitChips, type AudioTag, type SubtitleChip } from "@/lib/subtitle-model";
import { BASE_REM, useUiScale } from "@/hooks/use-ui-scale";

/**
 * Audio languages and subtitles, each led by its icon (speaker / captions):
 * one line of two equal columns (audio left, subtitles right), or with
 * `stacked` audio above subtitles for narrow poster overlays. Used by the
 * Sonarr episode rows and the Bazarr library rows and posters.
 *
 * Each column fills its whole width before collapsing the rest into "+N" —
 * never a fixed cap, so wider screens and the UI scale show as many tags as
 * actually fit. The width is measured, unless the caller knows it (`width`):
 * a poster cell in a virtualized grid would otherwise render twice per
 * recycle and visibly snap to its "+N" layout.
 */
export function LanguageLines({
  audio,
  subtitles,
  size = "sm",
  onPress,
  accessibilityLabel,
  ringClassName,
  stacked = false,
  width,
}: {
  audio: readonly AudioTag[];
  // Undefined when Bazarr has no data: the column stays as a blank spacer
  // (no captions icon claiming "none"), aligned with the rows around it.
  subtitles: readonly SubtitleChip[] | undefined;
  size?: TagSize;
  onPress?: () => void;
  accessibilityLabel?: string;
  ringClassName?: string;
  // Audio above subtitles instead of side by side (narrow poster overlays).
  stacked?: boolean;
  // The component's width in px when the caller already knows it (stacked
  // only: each line then spans it); otherwise the columns measure themselves.
  width?: number;
}) {
  const columnWidth = stacked ? width : undefined;
  const body = (
    <View className={stacked ? "gap-0.5" : "flex-row items-center gap-2.5"}>
      <Column icon="audio" size={size} count={audio.length} stacked={stacked} knownWidth={columnWidth}>
        {(shown) =>
          audio.slice(0, shown).map((a) => (
            <AudioLanguagePill
              key={a.code2}
              code={a.code2}
              name={a.name}
              original={a.original}
              size={size}
              ringClassName={ringClassName}
            />
          ))
        }
      </Column>
      {subtitles ? (
        <Column
          icon="subtitles"
          size={size}
          count={subtitles.length}
          stacked={stacked}
          knownWidth={columnWidth}
        >
          {(shown) =>
            subtitles.slice(0, shown).map((c) => (
              <SubtitleTrackChip
                key={c.key}
                code={c.code2}
                state={c.state}
                forced={c.forced}
                hi={c.hi}
                size={size}
                ringClassName={ringClassName}
              />
            ))
          }
        </Column>
      ) : stacked ? null : (
        <View className="flex-1" />
      )}
    </View>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      className="active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      {body}
    </Pressable>
  );
}

function Column({
  icon,
  size,
  count,
  stacked,
  knownWidth,
  children,
}: {
  icon: "audio" | "subtitles";
  size: TagSize;
  count: number;
  stacked: boolean;
  knownWidth?: number;
  children: (shown: number) => React.ReactNode;
}) {
  const scale = useUiScale();
  const [measured, setMeasured] = useState(0);
  const width = knownWidth ?? measured;
  const rem = BASE_REM * scale;
  const w = TAG_WIDTH_REM[size];
  const iconSize = size === "md" ? 14 : size === "sm" ? 12 : 10;
  // Room left after the leading icon and its gap.
  const available = width - iconSize * scale - w.gap * rem;
  // Until measured, render everything; the first layout pass corrects it.
  const shown =
    width === 0
      ? count
      : fitChips(
          count,
          available,
          (icon === "audio" ? w.pill : w.chip) * rem,
          w.gap * rem,
          w.chip * rem,
        );

  return (
    <View
      // No overflow clipping: corner badges poke above and right of their tag.
      // The top padding gives them room inside the row.
      // flex-1 splits a side-by-side row in half; stacked lines take the full
      // width on their own (flex-1 in a column would collapse them).
      className={`${stacked ? "" : "flex-1 "}flex-row items-center pt-1.5`}
      style={{ gap: w.gap * rem }}
      onLayout={knownWidth === undefined ? (e) => setMeasured(e.nativeEvent.layout.width) : undefined}
    >
      <Icon icon={icon === "audio" ? Volume2 : Captions} size={iconSize} color="#71717a" />
      {children(shown)}
      {shown < count ? <MoreTagsChip count={count - shown} size={size} /> : null}
    </View>
  );
}
