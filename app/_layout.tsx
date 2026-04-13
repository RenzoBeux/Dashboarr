import { useEffect, useRef } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useConfigStore } from "@/store/config-store";
import { useNotificationStore } from "@/store/notifications-store";
import { useBackendStore } from "@/store/backend-store";
import { configureNotifications } from "@/lib/notifications";
import { useNotificationWatchers } from "@/hooks/use-notification-watchers";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { pushConfigSnapshot } from "@/services/backend-api";
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

function NotificationWatchers() {
  useNotificationWatchers();
  return null;
}

function BackendHealthPoller() {
  useBackendHealth();
  return null;
}

const CONFIG_SYNC_DEBOUNCE_MS = 2000;

/**
 * Subscribes to config + notification stores and debounces a PUT /config to
 * the paired backend after any change. Only active while the backend is
 * paired (has a shared secret) — unpairing unsubscribes automatically.
 */
function ConfigSyncBridge() {
  const sharedSecret = useBackendStore((s) => s.sharedSecret);
  const backendHydrated = useBackendStore((s) => s.hydrated);
  const configHydrated = useConfigStore((s) => s.hydrated);
  const notificationsHydrated = useNotificationStore((s) => s.hydrated);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sharedSecret || !backendHydrated || !configHydrated || !notificationsHydrated) {
      return;
    }

    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        void pushConfigSnapshot().catch((err) => {
          console.warn("[backend-sync] pushConfigSnapshot failed", err);
        });
      }, CONFIG_SYNC_DEBOUNCE_MS);
    };

    const unsubConfig = useConfigStore.subscribe(schedule);
    const unsubNotifications = useNotificationStore.subscribe(schedule);

    return () => {
      unsubConfig();
      unsubNotifications();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sharedSecret, backendHydrated, configHydrated, notificationsHydrated]);

  return null;
}

export default function RootLayout() {
  const hydrate = useConfigStore((s) => s.hydrate);
  const hydrated = useConfigStore((s) => s.hydrated);
  const hydrateNotifications = useNotificationStore((s) => s.hydrate);
  const hydrateBackend = useBackendStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    hydrateNotifications();
    hydrateBackend();
    configureNotifications();
  }, [hydrate, hydrateNotifications, hydrateBackend]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  if (!hydrated) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <NotificationWatchers />
          <BackendHealthPoller />
          <ConfigSyncBridge />
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
