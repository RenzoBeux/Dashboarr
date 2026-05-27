import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  StreamingNowPlayingSettings,
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  type StreamingNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/streaming-now-playing-settings";

export type EmbyNowPlayingSettingsValue = StreamingNowPlayingSettingsValue;

export const EMBY_NOW_PLAYING_DEFAULT_SETTINGS: EmbyNowPlayingSettingsValue =
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS;

export function EmbyNowPlayingSettings(props: WidgetSettingsComponentProps) {
  return (
    <StreamingNowPlayingSettings
      {...props}
      serviceId="emby"
      hideLocalPlaysDescription="Skip sessions whose remote endpoint is on a private network"
      bitrateDescription="Transcoding stream bitrate in Mbps"
    />
  );
}
