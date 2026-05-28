import { useRouter } from "expo-router";
import { Play, Pause, Loader, Cog } from "lucide-react-native";
import { ServiceLogo } from "@/components/ui/service-logo";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterProgressStrip } from "@/components/dashboard/poster-progress-strip";
import type { NowPlayingStream } from "@/lib/now-playing-stream";

// Renders one normalized NowPlayingStream as a poster tile. Shared by the Plex,
// Jellyfin/Emby, and combined now-playing cards so the tile presentation lives
// in exactly one place. `showSource` adds the small source-server logo used by
// the combined widget; the per-service cards leave it off.
export function NowPlayingStreamTile({
  stream,
  showUserAndDevice,
  showTranscoding,
  showSource = false,
}: {
  stream: NowPlayingStream;
  showUserAndDevice: boolean;
  showTranscoding: boolean;
  showSource?: boolean;
}) {
  const router = useRouter();

  const StateIcon =
    stream.state === "paused" ? Pause : stream.state === "buffering" ? Loader : Play;
  const stateColor = stream.state === "playing" ? "#22c55e" : "#f59e0b";

  const subtitle =
    showUserAndDevice && (stream.user || stream.device)
      ? [stream.user, stream.device].filter(Boolean).join(" · ")
      : undefined;

  return (
    <MediaPosterTile
      posterUrl={stream.poster}
      title={stream.title}
      subtitle={subtitle}
      cornerBadge={{ icon: StateIcon, color: stateColor }}
      topLeftBadge={showSource ? <ServiceLogo id={stream.serviceId} size={14} /> : undefined}
      bottomLeftBadge={
        showTranscoding && stream.transcoding
          ? { icon: Cog, color: "rgba(245, 158, 11, 0.9)" }
          : undefined
      }
      bottomOverlay={<PosterProgressStrip progress={stream.progress} />}
      mediaType={stream.mediaType}
      onPress={() => router.push(`/(tabs)/${stream.serviceId}`)}
    />
  );
}
