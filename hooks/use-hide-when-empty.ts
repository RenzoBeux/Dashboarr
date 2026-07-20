import { useEffect } from "react";
import { useWidgetVisibilityStore } from "@/store/widget-visibility-store";

/**
 * Reports a widget slot's "hide when empty" outcome to the visibility store
 * (#282). The dashboard collapses the slot's wrapper; the widget itself stays
 * mounted so its queries keep polling and it can reappear when content shows
 * up. Never pass `isEmpty: true` while data is still loading — hand the
 * widget's `isInitialLoading` in via `isLoading` so the initial fetch renders
 * its skeleton instead of flashing hidden.
 */
export function useHideWhenEmpty(
  slotId: string,
  opts: { enabled: boolean; isEmpty: boolean; isLoading: boolean },
): void {
  const setSlotHidden = useWidgetVisibilityStore((s) => s.setSlotHidden);
  const hidden = opts.enabled && opts.isEmpty && !opts.isLoading;

  useEffect(() => {
    setSlotHidden(slotId, hidden);
  }, [slotId, hidden, setSlotHidden]);

  // Clear on unmount: slot removed, dashboard switched, or the widget crashed
  // into its error boundary — in every case the slot must not stay hidden.
  useEffect(
    () => () => setSlotHidden(slotId, false),
    [slotId, setSlotHidden],
  );
}
