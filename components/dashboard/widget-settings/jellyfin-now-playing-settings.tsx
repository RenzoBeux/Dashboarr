import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  StreamingNowPlayingSettings,
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  type StreamingNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/streaming-now-playing-settings";

export type JellyfinNowPlayingSettingsValue = StreamingNowPlayingSettingsValue;

export const JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS: JellyfinNowPlayingSettingsValue =
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS;

export function JellyfinNowPlayingSettings(props: WidgetSettingsComponentProps) {
  return (
    <StreamingNowPlayingSettings
      {...props}
      serviceId="jellyfin"
      hideLocalPlaysDescription="Skip sessions whose remote endpoint is on a private network"
      bitrateDescription="Transcoding stream bitrate in Mbps"
    />
  );
}
