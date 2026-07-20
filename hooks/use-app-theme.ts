import { resolveAppTheme, type AppTheme } from "@/lib/app-themes";
import { useConfigStore } from "@/store/config-store";

export function useAppTheme(): AppTheme {
  return resolveAppTheme(useConfigStore((s) => s.appTheme));
}
