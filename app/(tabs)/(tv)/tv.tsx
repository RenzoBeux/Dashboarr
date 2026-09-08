import { TvView } from "@/components/sonarr/tv-view";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Standalone TV tab. The screen body lives in TvView so the combined Library
// tab can reuse it behind a Movies/TV switcher.
export default function TVScreen() {
  return (
    <WorkspaceServiceGuard kinds={["sonarr"]}>
      <TvView />
    </WorkspaceServiceGuard>
  );
}
