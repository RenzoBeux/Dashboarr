import { MediaServerScreen } from "@/components/media-server/media-server-screen";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Emby shares the Jellyfin screen (MediaServerScreen) — same API surface,
// parameterized by serviceId. See lib/media-server-config.ts.
export default function EmbyScreen() {
  return (
    <WorkspaceServiceGuard kinds={["emby"]}>
      <MediaServerScreen serviceId="emby" />
    </WorkspaceServiceGuard>
  );
}
