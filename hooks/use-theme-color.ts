import { useCallback } from "react";
import { themeColor } from "@/lib/theme-palette";
import { useAppTheme } from "@/hooks/use-app-theme";

/**
 * Returns `tc(color)`, which resolves a color authored for the dark chrome
 * (e.g. "#71717a" or "#f87171") against the active theme. Under the Light
 * theme Tailwind palette hexes swap to their mirrored shade; everything else
 * passes through. See lib/theme-palette.ts (#450).
 *
 * <Icon> already does this for its `color` / `fill`; use this for the other
 * hex props (placeholderTextColor, ActivityIndicator, svg strokes, inline
 * style colors).
 */
export function useThemeColor() {
  const { scheme } = useAppTheme();
  return useCallback(
    <T extends string | undefined>(color: T): T => themeColor(color, scheme),
    [scheme],
  );
}
