import { create } from "zustand";

// Slots whose widget currently has nothing to show AND has "Hide when empty"
// enabled (#282). Ephemeral by design: every mounted widget re-reports its
// emptiness via useHideWhenEmpty, so persisting this would only risk stale
// hides across launches. The dashboard collapses hidden slots' wrappers while
// keeping the widgets mounted, so their queries keep polling and the widget
// reappears the moment content arrives.
interface WidgetVisibilityStore {
  hiddenSlots: Record<string, true>;
  setSlotHidden: (slotId: string, hidden: boolean) => void;
}

export const useWidgetVisibilityStore = create<WidgetVisibilityStore>(
  (set, get) => ({
    hiddenSlots: {},
    setSlotHidden: (slotId, hidden) => {
      // No-op when unchanged: widgets with the toggle off (the common case)
      // report `false` on every mount during the dashboard's progressive
      // reveal, and a fresh object per report would re-render the screen for
      // each batch.
      if (!!get().hiddenSlots[slotId] === hidden) return;
      set((s) => {
        const next = { ...s.hiddenSlots };
        if (hidden) next[slotId] = true;
        else delete next[slotId];
        return { hiddenSlots: next };
      });
    },
  }),
);
