import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";

const STORAGE_KEY = "ui.unraidSections";

// Remembered expand/collapse state for the long unRAID sections. Containers
// and the array disk list default expanded (they're the point of the tab);
// unassigned devices are just-in-case detail, so collapsed.
interface UnraidSectionPrefs {
  containersExpanded: boolean;
  arrayDisksExpanded: boolean;
  unassignedExpanded: boolean;
}

export const UNRAID_SECTION_DEFAULTS: UnraidSectionPrefs = {
  containersExpanded: true,
  arrayDisksExpanded: true,
  unassignedExpanded: false,
};

interface UnraidUiStore extends UnraidSectionPrefs {
  hydrate: () => void;
  setContainersExpanded: (v: boolean) => void;
  setArrayDisksExpanded: (v: boolean) => void;
  setUnassignedExpanded: (v: boolean) => void;
}

function snapshot(state: UnraidSectionPrefs): UnraidSectionPrefs {
  return {
    containersExpanded: state.containersExpanded,
    arrayDisksExpanded: state.arrayDisksExpanded,
    unassignedExpanded: state.unassignedExpanded,
  };
}

export const useUnraidUiStore = create<UnraidUiStore>((set, get) => ({
  ...UNRAID_SECTION_DEFAULTS,

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<Partial<UnraidSectionPrefs>>(STORAGE_KEY);
    if (stored) set({ ...UNRAID_SECTION_DEFAULTS, ...stored });
  },

  setContainersExpanded: (containersExpanded) => {
    set({ containersExpanded });
    setJSON(STORAGE_KEY, snapshot({ ...get(), containersExpanded }));
  },
  setArrayDisksExpanded: (arrayDisksExpanded) => {
    set({ arrayDisksExpanded });
    setJSON(STORAGE_KEY, snapshot({ ...get(), arrayDisksExpanded }));
  },
  setUnassignedExpanded: (unassignedExpanded) => {
    set({ unassignedExpanded });
    setJSON(STORAGE_KEY, snapshot({ ...get(), unassignedExpanded }));
  },
}));
