import { create } from "zustand";
import { getBoolean, setBoolean } from "@/store/storage";
import { STORAGE_KEYS } from "@/lib/constants";

// One-shot UI flags that aren't part of the user's config (so they don't
// belong on the config-store) but need to outlive a session and trigger UI.
// Currently scoped to the workspace intro carousel; can host more
// onboarding flags here as they're added.
interface IntroState {
  // True once the user has hydrated from storage. Lets _layout.tsx defer the
  // overlay mount until we know whether to show it.
  hydrated: boolean;
  // True after the user dismisses (Skip or Got-it) the carousel at least once.
  workspaceIntroSeen: boolean;
  // True once the Library tab's swipe coachmark has been dismissed.
  librarySwipeHintSeen: boolean;
  // Bumped by the "Show workspace tour" Settings row to force a re-mount
  // even when the seen flag was just set in the same session.
  showRequestVersion: number;

  hydrate: () => void;
  markWorkspaceIntroSeen: () => void;
  markLibrarySwipeHintSeen: () => void;
  // Re-trigger from Settings → About → "Show workspace tour".
  replayWorkspaceIntro: () => void;
}

export const useIntroStore = create<IntroState>((set) => ({
  hydrated: false,
  workspaceIntroSeen: false,
  librarySwipeHintSeen: false,
  showRequestVersion: 0,

  hydrate: () => {
    set({
      hydrated: true,
      workspaceIntroSeen: getBoolean(STORAGE_KEYS.workspaceIntroSeen),
      librarySwipeHintSeen: getBoolean(STORAGE_KEYS.librarySwipeHintSeen),
    });
  },

  markWorkspaceIntroSeen: () => {
    setBoolean(STORAGE_KEYS.workspaceIntroSeen, true);
    set({ workspaceIntroSeen: true });
  },

  markLibrarySwipeHintSeen: () => {
    setBoolean(STORAGE_KEYS.librarySwipeHintSeen, true);
    set({ librarySwipeHintSeen: true });
  },

  replayWorkspaceIntro: () => {
    setBoolean(STORAGE_KEYS.workspaceIntroSeen, false);
    set((s) => ({
      workspaceIntroSeen: false,
      showRequestVersion: s.showRequestVersion + 1,
    }));
  },
}));
