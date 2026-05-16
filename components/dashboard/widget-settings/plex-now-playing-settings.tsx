import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  StreamingNowPlayingSettings,
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS,
  type StreamingNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/streaming-now-playing-settings";

export type PlexNowPlayingSettingsValue = StreamingNowPlayingSettingsValue;

export const PLEX_NOW_PLAYING_DEFAULT_SETTINGS: PlexNowPlayingSettingsValue =
  STREAMING_NOW_PLAYING_DEFAULT_SETTINGS;

export function PlexNowPlayingSettings(props: WidgetSettingsComponentProps) {
  return (
    <StreamingNowPlayingSettings
      {...props}
      serviceId="plex"
      hideLocalPlaysDescription="Skip sessions playing on this network"
      bitrateDescription="Stream bandwidth in kbps"
    />
  );
}
