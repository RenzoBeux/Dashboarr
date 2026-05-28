import { MediaServerNowPlayingCard } from "@/components/media-server/media-server-now-playing-card";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";

// Jellyfin and Emby render the same now-playing card (MediaServerNowPlayingCard),
// parameterized by serviceId. See lib/media-server-config.ts.
export function JellyfinNowPlayingCard({ slotId }: WidgetComponentProps) {
  return <MediaServerNowPlayingCard slotId={slotId} serviceId="jellyfin" displayName="Jellyfin" />;
}
