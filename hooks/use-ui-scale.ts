import { useConfigStore } from "@/store/config-store";

export function useUiScale() {
  return useConfigStore((s) => s.uiScale);
}
