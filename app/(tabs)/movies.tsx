import { MoviesView } from "@/components/radarr/movies-view";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Standalone Movies tab. The screen body lives in MoviesView so the combined
// Library tab can reuse it behind a Movies/TV switcher.
export default function MoviesScreen() {
  return (
    <WorkspaceServiceGuard kinds={["radarr"]}>
      <MoviesView />
    </WorkspaceServiceGuard>
  );
}
