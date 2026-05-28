import { MediaServerScreen } from "@/components/media-server/media-server-screen";

// Jellyfin and Emby share one screen (MediaServerScreen), parameterized by
// serviceId — they expose the same API. See lib/media-server-config.ts.
export default function JellyfinScreen() {
  return <MediaServerScreen serviceId="jellyfin" />;
}
