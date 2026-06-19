import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Tv, Film, Check, Download, type LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useServiceImage } from "@/hooks/use-service-image";
import { useUiScale } from "@/hooks/use-ui-scale";
import {
  downloadIndicator,
  DOWNLOAD_INDICATOR_COLOR,
} from "@/lib/arr-poster-status";

interface PosterImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

// Row geometry (dp at scale 1.0; multiplied by uiScale at render). Matches the
// backdrop-row proportions the dashboard used before.
const ROW_HEIGHT = 64;
const POSTER_W = 44;
const POSTER_H = 56;

const SERVICE_FALLBACK: Record<"sonarr" | "radarr", LucideIcon> = {
  sonarr: Tv,
  radarr: Film,
};

export interface CalendarEventRowProps {
  images: PosterImage[];
  service: "sonarr" | "radarr";
  title: string;
  subtitle: string;
  /** Drives the status indicators: green when downloaded, gray when missing. */
  hasFile: boolean;
  /**
   * Whether the episode/movie is currently in the *arr download queue. Takes
   * priority over `hasFile` and turns the badge purple (issue #207).
   */
  downloading?: boolean;
  /**
   * Explicit left-spine color, so the row matches the poster grid's bar for the
   * same item (red = missing, blue = upcoming, etc. via radarr/sonarr bar kinds
   * — issue #217). When omitted the spine falls back to the green/purple/gray
   * download indicator.
   */
  barColor?: string;
  onPress: () => void;
  /** Optional long-press (e.g. the TV calendar opens an episode action sheet). */
  onLongPress?: () => void;
  /**
   * Optional trailing action button. When set it replaces the static status
   * badge (e.g. the Still Pending widget puts a per-row search trigger there —
   * every row is missing, so the badge would be redundant).
   */
  action?: { icon: LucideIcon; onPress: () => void; loading?: boolean };
}

/**
 * Shared "releasing soon" row used by both the Calendar tab (SelectedDayList)
 * and the dashboard "Releasing Soon" card so they stay visually in lockstep.
 *
 * The backdrop (fanart) fills the row behind a left→right scrim; a colored left
 * spine plus a status badge make it scannable at a glance: green check when the
 * episode/movie is downloaded, a neutral download glyph when it still isn't.
 */
export function CalendarEventRow({
  images,
  service,
  title,
  subtitle,
  hasFile,
  downloading = false,
  barColor,
  onPress,
  onLongPress,
  action,
}: CalendarEventRowProps) {
  const scale = useUiScale();
  const rowHeight = Math.round(ROW_HEIGHT * scale);
  const posterW = Math.round(POSTER_W * scale);
  const posterH = Math.round(POSTER_H * scale);

  const poster = images.find((i) => i.coverType === "poster");
  const fanart = images.find((i) => i.coverType === "fanart");
  const { src: posterSrc, onError: onPosterError } = useServiceImage(poster, service);
  const { src: backdropSrc, onError: onBackdropError } = useServiceImage(fanart, service);

  const FallbackIcon = SERVICE_FALLBACK[service];
  const indicator = downloadIndicator(hasFile, downloading);
  // Spine mirrors the poster grid's bar (issue #217) when the caller passes a
  // kind color; otherwise it falls back to the 3-state download indicator.
  const statusColor = barColor ?? DOWNLOAD_INDICATOR_COLOR[indicator];
  // Trailing badge tracks the SAME color as the spine (a missing item now reads
  // red on both, not red spine + gray badge). Check when downloaded, download
  // glyph otherwise. `+ "33"` = ~20% alpha (8-digit hex) for the tinted pill.
  const BadgeIcon = hasFile ? Check : Download;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="active:opacity-80 overflow-hidden rounded-xl bg-surface-light"
      style={{ height: rowHeight }}
    >
      {backdropSrc ? (
        <Image
          source={{ uri: backdropSrc }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={backdropSrc}
          onError={onBackdropError}
        />
      ) : null}

      {/* Left→right dark scrim so the title stays legible over any backdrop. */}
      <LinearGradient
        colors={[
          "rgba(15, 15, 17, 0.94)",
          "rgba(15, 15, 17, 0.78)",
          "rgba(15, 15, 17, 0.5)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* Status spine — quick scan cue down the list. */}
      <View
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ backgroundColor: statusColor }}
      />

      <View className="flex-row items-center h-full pl-3 pr-3 gap-3">
        <View
          className="rounded-md overflow-hidden bg-surface"
          style={{ width: posterW, height: posterH }}
        >
          {posterSrc ? (
            <Image
              source={{ uri: posterSrc }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={posterSrc}
              onError={onPosterError}
            />
          ) : (
            <View className="w-full h-full items-center justify-center">
              <Icon icon={FallbackIcon} size={18} color="#71717a" />
            </View>
          )}
        </View>

        <View className="flex-1">
          <Text className="text-zinc-50 text-sm font-semibold" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-zinc-300 text-xs" numberOfLines={1}>
            {subtitle}
          </Text>
        </View>

        {action ? (
          <Pressable
            onPress={action.loading ? undefined : action.onPress}
            hitSlop={8}
            className="w-7 h-7 rounded-full items-center justify-center active:opacity-70"
            style={{ backgroundColor: "rgba(255, 255, 255, 0.12)" }}
          >
            {action.loading ? (
              <ActivityIndicator size="small" color="#d4d4d8" />
            ) : (
              <Icon icon={action.icon} size={14} color="#d4d4d8" />
            )}
          </Pressable>
        ) : (
          /* Status badge — same color as the spine; check when downloaded. */
          <View
            className="w-7 h-7 rounded-full items-center justify-center"
            style={{ backgroundColor: statusColor + "33" }}
          >
            <Icon icon={BadgeIcon} size={14} color={statusColor} />
          </View>
        )}
      </View>
    </Pressable>
  );
}
