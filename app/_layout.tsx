import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useConfigStore } from "@/store/config-store";
import { ErrorBoundary } from "@/components/common/error-boundary";
import { ToastContainer } from "@/components/ui/toast";
import "../global.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      staleTime: 5000,
      gcTime: 300000,
    },
  },
});

// Pause/resume polling based on app state
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
}

export default function RootLayout() {
  const hydrate = useConfigStore((s) => s.hydrate);
  const hydrated = useConfigStore((s) => s.hydrated);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  if (!hydrated) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: "#09090b" },
              animation: "slide_from_right",
            }}
          />
          <ToastContainer />
        </ErrorBoundary>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
