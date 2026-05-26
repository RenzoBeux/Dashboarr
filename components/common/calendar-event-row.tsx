import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Tv, Film, Check, Download, type LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useServiceImage } from "@/hooks/use-service-image";
import { useUiScale } from "@/hooks/use-ui-scale";

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

// Downloaded vs not-yet-downloaded. The calendar lists *upcoming* releases, so
// "not downloaded" is expected (not an error) — keep it neutral, not alarming.
const DOWNLOADED = "#22c55e";
const PENDING = "#52525b";

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
  onPress: () => void;
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
  onPress,
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
  const statusColor = hasFile ? DOWNLOADED : PENDING;

  return (
    <Pressable
      onPress={onPress}
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

        {/* Status badge — explicit downloaded / not-yet state. */}
        <View
          className="w-7 h-7 rounded-full items-center justify-center"
          style={{
            backgroundColor: hasFile
              ? "rgba(34, 197, 94, 0.2)"
              : "rgba(255, 255, 255, 0.12)",
          }}
        >
          <Icon
            icon={hasFile ? Check : Download}
            size={14}
            color={hasFile ? DOWNLOADED : "#d4d4d8"}
          />
        </View>
      </View>
    </Pressable>
  );
}
