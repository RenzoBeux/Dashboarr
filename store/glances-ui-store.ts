import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.glancesSections";

// Remembered expand/collapse state for the long Glances sections. Per-core
// defaults collapsed (the whole point on many-core servers — see issue #67);
// the containers list defaults expanded so the new section is discoverable.
interface GlancesSectionPrefs {
  perCoreExpanded: boolean;
  containersExpanded: boolean;
}

export const GLANCES_SECTION_DEFAULTS: GlancesSectionPrefs = {
  perCoreExpanded: false,
  containersExpanded: true,
};

interface GlancesUiStore extends GlancesSectionPrefs {
  hydrate: () => void;
  setPerCoreExpanded: (v: boolean) => void;
  setContainersExpanded: (v: boolean) => void;
}

function snapshot(state: GlancesSectionPrefs): GlancesSectionPrefs {
  return {
    perCoreExpanded: state.perCoreExpanded,
    containersExpanded: state.containersExpanded,
  };
}

export const useGlancesUiStore = create<GlancesUiStore>((set, get) => ({
  ...GLANCES_SECTION_DEFAULTS,

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<Partial<GlancesSectionPrefs>>(STORAGE_KEY);
    if (stored) set({ ...GLANCES_SECTION_DEFAULTS, ...stored });
  },

  setPerCoreExpanded: (perCoreExpanded) => {
    set({ perCoreExpanded });
    setJSON(STORAGE_KEY, snapshot({ ...get(), perCoreExpanded }));
  },
  setContainersExpanded: (containersExpanded) => {
    set({ containersExpanded });
    setJSON(STORAGE_KEY, snapshot({ ...get(), containersExpanded }));
  },
}));
