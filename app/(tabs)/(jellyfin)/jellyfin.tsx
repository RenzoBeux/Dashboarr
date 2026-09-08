import { MediaServerScreen } from "@/components/media-server/media-server-screen";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Jellyfin and Emby share one screen (MediaServerScreen), parameterized by
// serviceId — they expose the same API. See lib/media-server-config.ts.
export default function JellyfinScreen() {
  return (
    <WorkspaceServiceGuard kinds={["jellyfin"]}>
      <MediaServerScreen serviceId="jellyfin" />
    </WorkspaceServiceGuard>
  );
}
