import { useLibraryViewStore, type LibraryViewMode } from "@/store/library-view-store";

/**
 * The persisted list/poster choice of one library screen. `key` names the
 * screen ("bazarr-movies", "radarr"); `fallback` is used until the user picks.
 */
export function useLibraryView(key: string, fallback: LibraryViewMode = "list") {
  const mode = useLibraryViewStore((s) => s.modes[key] ?? fallback);
  const setStored = useLibraryViewStore((s) => s.setMode);
  return {
    mode,
    setMode: (next: LibraryViewMode) => setStored(key, next),
    toggle: () => setStored(key, mode === "list" ? "poster" : "list"),
  };
}
