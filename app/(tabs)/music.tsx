import { MusicView } from "@/components/lidarr/music-view";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Standalone Music tab (Lidarr). The screen body lives in MusicView so it can
// be reused embedded elsewhere, mirroring MoviesView / TvView.
export default function MusicScreen() {
  return (
    <WorkspaceServiceGuard kinds={["lidarr"]}>
      <MusicView />
    </WorkspaceServiceGuard>
  );
}
