import { useCallback, useMemo } from "react";
import { useConfigStore } from "@/store/config-store";
import type { WidgetId } from "@/lib/constants";

/**
 * Reads and writes per-widget settings from the config store. Defaults are
 * merged in at read time so a widget always receives every key its component
 * expects, even after a schema field was added without a config migration.
 *
 * Returns:
 *   - `settings`: defaults merged with any persisted overrides
 *   - `update(partial)`: persists `{ ...settings, ...partial }`
 *   - `reset()`: removes the persisted entry so the widget falls back to defaults
 */
export function useWidgetSettings<T extends Record<string, unknown>>(
  id: WidgetId,
  defaults: T,
): {
  settings: T;
  update: (partial: Partial<T>) => void;
  reset: () => void;
} {
  const stored = useConfigStore((s) => s.widgetSettings[id]);
  const setWidgetSettings = useConfigStore((s) => s.setWidgetSettings);
  const resetWidgetSettings = useConfigStore((s) => s.resetWidgetSettings);

  const settings = useMemo(() => ({ ...defaults, ...(stored as Partial<T>) }) as T, [defaults, stored]);

  const update = useCallback(
    (partial: Partial<T>) => {
      setWidgetSettings(id, { ...settings, ...partial });
    },
    [id, settings, setWidgetSettings],
  );

  const reset = useCallback(() => {
    resetWidgetSettings(id);
  }, [id, resetWidgetSettings]);

  return { settings, update, reset };
}
