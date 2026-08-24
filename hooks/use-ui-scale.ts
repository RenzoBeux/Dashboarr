import { useConfigStore } from "@/store/config-store";

// Root rem value at uiScale 1.0 — app/_layout.tsx feeds rem.set(BASE_REM * uiScale),
// so `BASE_REM * useUiScale()` is the current pt size of 1rem.
export const BASE_REM = 14;

export function useUiScale() {
  return useConfigStore((s) => s.uiScale);
}
