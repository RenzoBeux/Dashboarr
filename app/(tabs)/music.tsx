import { MusicView } from "@/components/lidarr/music-view";

// Standalone Music tab (Lidarr). The screen body lives in MusicView so it can
// be reused embedded elsewhere, mirroring MoviesView / TvView.
export default function MusicScreen() {
  return <MusicView />;
}
