import { TvView } from "@/components/sonarr/tv-view";

// Standalone TV tab. The screen body lives in TvView so the combined Library
// tab can reuse it behind a Movies/TV switcher.
export default function TVScreen() {
  return <TvView />;
}
