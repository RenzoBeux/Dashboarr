import { MediaServerNowPlayingCard } from "@/components/media-server/media-server-now-playing-card";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Emby now-playing card — mirror of the Jellyfin one, sharing
// MediaServerNowPlayingCard. See lib/media-server-config.ts.
export function EmbyNowPlayingCard({ slotId }: WidgetComponentProps) {
  return <MediaServerNowPlayingCard slotId={slotId} serviceId="emby" displayName="Emby" />;
}
