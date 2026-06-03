import { MoviesView } from "@/components/radarr/movies-view";

// Standalone Movies tab. The screen body lives in MoviesView so the combined
// Library tab can reuse it behind a Movies/TV switcher.
export default function MoviesScreen() {
  return <MoviesView />;
}
