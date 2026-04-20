import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
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

// Notification payloads come from a paired backend. The backend is trusted,
// but "trusted" is a posture — if a user is ever tricked into re-pairing to
// a rogue server, these IDs flow straight into router.push. Validate format
// so a malformed payload can't inject path traversal or crash the router.
const POSITIVE_INT = /^\d+$/;
const TORRENT_HASH = /^[a-f0-9]{40}$/i;

function asPositiveIntId(value: unknown): string | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return String(value);
  }
  if (typeof value === "string" && POSITIVE_INT.test(value) && value !== "0") {
    return value;
  }
  return null;
}

function asTorrentHash(value: unknown): string | null {
  return typeof value === "string" && TORRENT_HASH.test(value) ? value.toLowerCase() : null;
}

function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    function handleNotificationData(data: Record<string, unknown> | undefined) {
      if (!data?.type) return;

      switch (data.type) {
        case "radarr": {
          const id = asPositiveIntId(data.movieId);
          if (id) router.push(`/movie/${id}`);
          break;
        }
        case "sonarr": {
          const id = asPositiveIntId(data.seriesId);
          if (id) router.push(`/series/${id}`);
          break;
        }
        case "torrent": {
          const hash = asTorrentHash(data.hash);
          if (hash) router.push(`/torrent/${hash}`);
          break;
        }
        case "overseerr":
          router.push("/(tabs)/requests");
          break;
        case "health":
          router.push("/(tabs)/services");
          break;
      }
    }

    // Handle tap when app was killed (cold start)
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        handleNotificationData(
          response.notification.request.content.data as Record<string, unknown> | undefined,
        );
      }
    });

    // Handle tap when app is in background or foreground
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationData(
        response.notification.request.content.data as Record<string, unknown> | undefined,
      );
    });

    return () => subscription.remove();
  }, [router]);

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
          <NotificationRouter />
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
