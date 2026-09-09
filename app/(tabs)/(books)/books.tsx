import { BooksView } from "@/components/bindery/books-view";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";

// Standalone Books tab (Bindery). The screen body lives in BooksView so it can
// be reused embedded elsewhere, mirroring MusicView / MoviesView.
export default function BooksScreen() {
  return (
    <WorkspaceServiceGuard kinds={["bindery"]}>
      <BooksView />
    </WorkspaceServiceGuard>
  );
}
