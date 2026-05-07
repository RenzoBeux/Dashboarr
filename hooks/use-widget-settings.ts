import { useCallback, useMemo } from "react";
import { useConfigStore } from "@/store/config-store";

/**
 * Reads and writes per-slot widget settings from the config store. Defaults
 * are merged in at read time so a widget always receives every key its
 * component expects, even after a settings field was added without a config
 * migration.
 *
 * Slot ids are stable per-placement: the same widget added twice on different
 * dashboards (or removed and re-added on the same dashboard) gets a fresh
 * slot id and so a fresh empty settings record. This is what lets the same
 * widget carry different instance bindings on different dashboards.
 *
 * Returns:
 *   - `settings`: defaults merged with any persisted overrides
 *   - `update(partial)`: persists `{ ...settings, ...partial }` onto the slot
 *   - `reset()`: removes the persisted entry so the widget falls back to defaults
 */
export function useWidgetSettings<T extends Record<string, unknown>>(
  slotId: string,
  defaults: T,
): {
  settings: T;
  update: (partial: Partial<T>) => void;
  reset: () => void;
} {
  // Walk every dashboard for the slot. We don't constrain the lookup to the
  // active dashboard so the settings sheet keeps working if it's open at the
  // moment the user switches dashboards via the picker (the slot still exists
  // on its own dashboard). With a few dashboards × a few slots each, the cost
  // is trivial.
  const stored = useConfigStore((s) => {
    for (const d of s.dashboards) {
      const slot = d.widgets.find((w) => w.id === slotId);
      if (slot) return slot.settings;
    }
    return undefined;
  });
  const setSlotSettings = useConfigStore((s) => s.setSlotSettings);
  const resetSlotSettings = useConfigStore((s) => s.resetSlotSettings);

  const settings = useMemo(
    () => ({ ...defaults, ...(stored as Partial<T>) }) as T,
    [defaults, stored],
  );

  const update = useCallback(
    (partial: Partial<T>) => {
      setSlotSettings(slotId, { ...settings, ...partial });
    },
    [slotId, settings, setSlotSettings],
  );

  const reset = useCallback(() => {
    resetSlotSettings(slotId);
  }, [slotId, resetSlotSettings]);

  return { settings, update, reset };
}
