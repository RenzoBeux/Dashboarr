import { create } from "zustand";
import { getJSON, setJSON } from "@/store/storage";
import { BESZEL_RANGE_ORDER, type BeszelRange } from "@/lib/beszel-ranges";

const STORAGE_KEY = "ui.beszelRange";
const DEFAULT_RANGE: BeszelRange = "1h";

// The Beszel system screen's chart range, remembered across launches like the
// hub web UI's own chart-time setting. Device-local UI state, not config:
// it deliberately stays out of the config backup.
interface BeszelUiStore {
  range: BeszelRange;
  hydrate: () => void;
  setRange: (range: BeszelRange) => void;
}

export const useBeszelUiStore = create<BeszelUiStore>((set) => ({
  range: DEFAULT_RANGE,

  // Reads from the storage cache, populated by useConfigStore.hydrate(). Must
  // be called after that; safe to call multiple times.
  hydrate: () => {
    const stored = getJSON<string>(STORAGE_KEY);
    const valid = BESZEL_RANGE_ORDER.find((r) => r === stored);
    set({ range: valid ?? DEFAULT_RANGE });
  },

  setRange: (range) => {
    set({ range });
    setJSON(STORAGE_KEY, range);
  },
}));
