import { useMemo } from "react";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useAppTheme } from "@/hooks/use-app-theme";

// Shared by the root stack and by every tab's stack. native-stack shows a
// header by default and a parent's screenOptions never cascade into nested
// navigators, so each stack applies these itself.
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const theme = useAppTheme();
  return useMemo(
    () => ({
      headerShown: false,
      contentStyle: { backgroundColor: theme.background },
      animation: "slide_from_right",
    }),
    [theme.background],
  );
}
