import { MediaServerScreen } from "@/components/media-server/media-server-screen";

// Emby shares the Jellyfin screen (MediaServerScreen) — same API surface,
// parameterized by serviceId. See lib/media-server-config.ts.
export default function EmbyScreen() {
  return <MediaServerScreen serviceId="emby" />;
}
