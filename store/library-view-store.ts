import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.libraryViews";

export type LibraryViewMode = "list" | "poster";

// How each library screen is shown (list rows or a poster grid), keyed by
// screen ("bazarr-movies", "radarr", …). Persisted: it is a durable "this is
// how I browse" preference, like the tag filters (library-tag-filter-store).
// Not keyed per instance — layout is about the screen, not the server.
interface LibraryViewPrefs {
  modes: Record<string, LibraryViewMode>;
}

interface LibraryViewStore extends LibraryViewPrefs {
  hydrate: () => void;
  setMode: (key: string, mode: LibraryViewMode) => void;
}

export const useLibraryViewStore = create<LibraryViewStore>((set, get) => ({
  modes: {},

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<Partial<LibraryViewPrefs>>(STORAGE_KEY);
    if (stored?.modes && typeof stored.modes === "object") {
      const modes: Record<string, LibraryViewMode> = {};
      for (const [key, mode] of Object.entries(stored.modes)) {
        if (mode === "list" || mode === "poster") modes[key] = mode;
      }
      set({ modes });
    }
  },

  setMode: (key, mode) => {
    const modes = { ...get().modes, [key]: mode };
    set({ modes });
    setJSON(STORAGE_KEY, { modes });
  },
}));
