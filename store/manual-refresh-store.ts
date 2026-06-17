import { create } from "zustand";

// Ephemeral (never persisted) count of in-flight manual pull-to-refreshes.
// `useRefreshSpinner` bumps it when the user pulls and drops it when the spinner
// settles, so widgets can show a "refreshing" affordance during a user-initiated
// refresh WITHOUT also reacting to background polls — a routine 30s TanStack
// poll never touches this store, so it can't blink the indicator every interval.
//
// A counter (not a boolean): if two refresh-driving screens are briefly alive at
// once, one screen's teardown can't clear the gate the other is still holding.
// `end` floors at 0 so a stray decrement can never strand it negative.
//
// Used by the dashboard "Services" widget so its title spinner appears on a Home
// pull-to-refresh — the #196 follow-up where `isPending || isPlaceholderData`
// never flips on a same-key invalidate refetch (only `isFetching` does).
interface ManualRefreshState {
  count: number;
  begin: () => void;
  end: () => void;
}

export const useManualRefresh = create<ManualRefreshState>((set) => ({
  count: 0,
  begin: () => set((s) => ({ count: s.count + 1 })),
  end: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));
