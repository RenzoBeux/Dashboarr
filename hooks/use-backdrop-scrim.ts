import { useMemo } from "react";
import { useAppTheme } from "@/hooks/use-app-theme";

/**
 * Gradient stops for a legibility scrim laid over a backdrop image (calendar
 * and dashboard backdrop rows): near-black under the dark themes, white under
 * Light, so the themed text classes on top always contrast (#450).
 */
export function useBackdropScrim(
  alphas: readonly [number, number, number],
): readonly [string, string, string] {
  const { scheme } = useAppTheme();
  const rgb = scheme === "light" ? "255, 255, 255" : "15, 15, 17";
  const [a, b, c] = alphas;
  return useMemo(
    () => [`rgba(${rgb}, ${a})`, `rgba(${rgb}, ${b})`, `rgba(${rgb}, ${c})`] as const,
    [rgb, a, b, c],
  );
}
