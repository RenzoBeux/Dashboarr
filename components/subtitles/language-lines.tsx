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
 * One line, two equal columns: audio languages on the left, subtitles on the
 * right, both left-aligned and each led by its icon (speaker / captions).
 * Used by the Sonarr episode rows and the Bazarr library rows and posters.
 *
 * Each column fills its whole width before collapsing the rest into "+N" —
 * the count is measured, never a fixed cap, so wider screens and the UI scale
 * show as many tags as actually fit.
 */
export function LanguageLines({
  audio,
  subtitles,
  size = "sm",
  onPress,
  accessibilityLabel,
  ringClassName,
}: {
  audio: readonly AudioTag[];
  // Undefined when Bazarr has no data: the column stays as a blank spacer
  // (no captions icon claiming "none"), aligned with the rows around it.
  subtitles: readonly SubtitleChip[] | undefined;
  size?: TagSize;
  onPress?: () => void;
  accessibilityLabel?: string;
  ringClassName?: string;
}) {
  const body = (
    <View className="flex-row items-center gap-2.5">
      <Column icon="audio" size={size} count={audio.length}>
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
        <Column icon="subtitles" size={size} count={subtitles.length}>
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
      ) : (
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
  children,
}: {
  icon: "audio" | "subtitles";
  size: TagSize;
  count: number;
  children: (shown: number) => React.ReactNode;
}) {
  const scale = useUiScale();
  const [width, setWidth] = useState(0);
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
      className="flex-1 flex-row items-center pt-1.5"
      style={{ gap: w.gap * rem }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <Icon icon={icon === "audio" ? Volume2 : Captions} size={iconSize} color="#71717a" />
      {children(shown)}
      {shown < count ? <MoreTagsChip count={count - shown} size={size} /> : null}
    </View>
  );
}
