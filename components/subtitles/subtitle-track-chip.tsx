import { View, Text } from "react-native";
import { Ear, House } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import type { SubtitleState } from "@/lib/subtitle-model";

/**
 * The language tags used everywhere subtitles and audio appear (movie card,
 * episode rows, coverage grid, Bazarr library rows and posters).
 *
 * Subtitles are square chips whose fill says whether the subtitle exists:
 * solid blue = a file, grey = a track inside the video, dashed orange = wanted
 * but missing. Audio is a round outlined pill, so the two never read as the
 * same thing. A modifier sits in a round corner badge — "F" for forced, an
 * ear for hearing-impaired, a house on the audio pill for the original
 * language — so it is never mistaken for part of the language code.
 *
 * Sizes: "md" in cards and sheets, "sm" in list rows, "xs" over posters.
 * All rem-based, so they follow the UI scale.
 */

export type TagSize = "md" | "sm" | "xs";

const CHIP_SIZE: Record<TagSize, { box: string; text: string }> = {
  md: { box: "min-w-[2rem] h-[1.5rem] px-1.5 rounded-md", text: "text-[0.7rem]" },
  sm: { box: "min-w-[1.6rem] h-[1.2rem] px-1 rounded-[0.36rem]", text: "text-[0.6rem]" },
  xs: { box: "min-w-[1.2rem] h-[0.95rem] px-[0.3rem] rounded-[0.28rem]", text: "text-[0.5rem]" },
};

const PILL_SIZE: Record<TagSize, { box: string; text: string }> = {
  md: { box: "min-w-[2rem] h-[1.5rem] px-2", text: "text-[0.7rem]" },
  sm: { box: "min-w-[1.7rem] h-[1.2rem] px-[0.5rem]", text: "text-[0.6rem]" },
  xs: { box: "min-w-[1.2rem] h-[0.95rem] px-[0.36rem]", text: "text-[0.5rem]" },
};

const CHIP_STATE: Record<SubtitleState, { box: string; text: string }> = {
  // Solid accent fill: text stays white in both themes.
  present: { box: "bg-primary", text: "text-white" },
  embedded: { box: "bg-zinc-800 border border-zinc-600", text: "text-zinc-400" },
  missing: { box: "border-[0.1rem] border-dashed border-orange-400", text: "text-orange-400" },
};

/**
 * Approximate rendered widths in rem, for laying out "+N" overflow
 * (lib/subtitle-model `fitChips`). Two-letter codes fit the minimum width.
 */
export const TAG_WIDTH_REM: Record<TagSize, { chip: number; pill: number; gap: number }> = {
  md: { chip: 2, pill: 2.2, gap: 0.72 },
  sm: { chip: 1.6, pill: 1.75, gap: 0.55 },
  xs: { chip: 1.2, pill: 1.25, gap: 0.3 },
};

const STATE_LABEL: Record<SubtitleState, string> = {
  present: "subtitle file",
  embedded: "embedded subtitle track",
  missing: "missing subtitle",
};

export function SubtitleTrackChip({
  code,
  name,
  state,
  forced = false,
  hi = false,
  size = "md",
  ringClassName,
}: {
  code: string;
  name?: string;
  state: SubtitleState;
  forced?: boolean;
  hi?: boolean;
  size?: TagSize;
  // Color of the badge's cut-out ring: the surface the chip sits on.
  ringClassName?: string;
}) {
  const s = CHIP_SIZE[size];
  const c = CHIP_STATE[state];
  const label = `${name ?? code}${forced ? ", forced" : ""}${hi ? ", hearing impaired" : ""}, ${STATE_LABEL[state]}`;
  return (
    <View className="relative flex-shrink-0" accessible accessibilityLabel={label}>
      <View className={`items-center justify-center ${s.box} ${c.box}`}>
        <Text className={`font-extrabold tracking-wide ${s.text} ${c.text}`}>
          {code.toUpperCase()}
        </Text>
      </View>
      {forced ? (
        <CornerBadge size={size} ringClassName={ringClassName}>
          <Text className={`font-black text-zinc-900 ${BADGE_TEXT[size]}`}>F</Text>
        </CornerBadge>
      ) : hi ? (
        <CornerBadge size={size} ringClassName={ringClassName}>
          <Icon icon={Ear} size={BADGE_ICON[size]} color="#18181b" strokeWidth={2.6} />
        </CornerBadge>
      ) : null}
    </View>
  );
}

export function AudioLanguagePill({
  code,
  name,
  original = false,
  size = "md",
  ringClassName,
}: {
  code: string;
  name?: string;
  original?: boolean;
  size?: TagSize;
  ringClassName?: string;
}) {
  const s = PILL_SIZE[size];
  return (
    <View
      className="relative flex-shrink-0"
      accessible
      accessibilityLabel={`${name ?? code} audio${original ? ", original language" : ""}`}
    >
      <View
        className={`items-center justify-center rounded-full border border-zinc-500 ${s.box}`}
      >
        <Text className={`font-extrabold tracking-wide text-zinc-300 ${s.text}`}>
          {code.toUpperCase()}
        </Text>
      </View>
      {original ? (
        <CornerBadge size={size} ringClassName={ringClassName}>
          <Icon icon={House} size={BADGE_ICON[size]} color="#18181b" strokeWidth={2.6} />
        </CornerBadge>
      ) : null}
    </View>
  );
}

/** "+3" after the chips that fit. */
export function MoreTagsChip({ count, size = "md" }: { count: number; size?: TagSize }) {
  return (
    <View
      className={`items-center justify-center flex-shrink-0 ${CHIP_SIZE[size].box}`}
      accessible
      accessibilityLabel={`${count} more`}
    >
      <Text className={`font-bold text-zinc-400 ${CHIP_SIZE[size].text}`}>+{count}</Text>
    </View>
  );
}

const BADGE_BOX: Record<TagSize, string> = {
  md: "w-[1.1rem] h-[1.1rem] -top-[0.45rem] -right-[0.5rem]",
  sm: "w-[0.9rem] h-[0.9rem] -top-[0.38rem] -right-[0.45rem]",
  xs: "w-[0.72rem] h-[0.72rem] -top-[0.3rem] -right-[0.35rem]",
};
const BADGE_TEXT: Record<TagSize, string> = {
  md: "text-[0.62rem]",
  sm: "text-[0.52rem]",
  xs: "text-[0.42rem]",
};
const BADGE_ICON: Record<TagSize, number> = { md: 9, sm: 7, xs: 6 };

function CornerBadge({
  size,
  ringClassName = "border-surface",
  children,
}: {
  size: TagSize;
  ringClassName?: string;
  children: React.ReactNode;
}) {
  // Light pill with a ring in the surface color, so it reads as cut out of the
  // chip's corner. zinc-200/zinc-900 flip together under the Light theme.
  return (
    <View
      className={`absolute rounded-full bg-zinc-200 items-center justify-center border-2 ${ringClassName} ${BADGE_BOX[size]}`}
    >
      {children}
    </View>
  );
}
