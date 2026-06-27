import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider, focusManager } from "@tanstack/react-query";
import { AppState } from "react-native";
import type { AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider, initialWindowMetrics } from "react-native-safe-area-context";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { rem } from "nativewind";
import { useConfigStore } from "@/store/config-store";
import { useBackendStore } from "@/store/backend-store";
import { useSortStore } from "@/store/sort-store";
import { useGlancesUiStore } from "@/store/glances-ui-store";
import { useReleaseFilterStore } from "@/store/releases-filter-store";
import { useIntroStore } from "@/store/intro-store";
import { queryClient } from "@/lib/query-client";
import { configureNotifications } from "@/lib/notifications";
import "@/lib/wifi"; // side-effect: NetInfo.configure({ shouldFetchWiFiSSID: true })
import "@/lib/expo-image-nativewind"; // side-effect: cssInterop on expo-image's Image
import { NotificationWatchers } from "@/hooks/use-notification-watchers";
import { useBackendHealth } from "@/hooks/use-backend-health";
import { useNetworkAutoSwitch } from "@/hooks/use-network";
import { evaluateHomeNetwork } from "@/lib/network";
import { pushConfigSnapshot } from "@/services/backend-api";
import { syncInsecureHosts } from "@/lib/insecure-tls";
import { ErrorBoundary, SilentErrorBoundary } from "@/components/common/error-boundary";
import { AppUpdateChecker } from "@/components/common/app-update-checker";
import { ToastContainer } from "@/components/ui/toast";
import { WorkspaceIntroOverlay } from "@/components/onboarding/workspace-intro-overlay";
import "../global.css";

// Pause/resume polling based on app state
function onAppStateChange(status: AppStateStatus) {
  focusManager.setFocused(status === "active");
  if (status === "active") {
    // The network may have changed while we were backgrounded — walked out the
    // door, or toggled a VPN like Tailscale (whose interface changes don't
    // deliver NetInfo events to a suspended JS runtime). Re-evaluate the home
    // network so URLs and health dots reflect reality on resume (#161). Shares
    // the evaluator's in-flight gate; with auto-switch off it still refreshes
    // the isVpnActive flag the LAN guard reads (#185), then no-ops.
    void evaluateHomeNetwork();
  }
}

// Notification payloads come from a paired backend. The backend is trusted,
// but "trusted" is a posture — if a user is ever tricked into re-pairing to
// a rogue server, these IDs flow straight into router.push. Validate format
// so a malformed payload can't inject path traversal or crash the router.
const POSITIVE_INT = /^\d+$/;
const TORRENT_HASH = /^[a-f0-9]{40}$/i;
// SABnzbd nzo_id format: "SABnzbd_nzo_<random>", letters/digits/underscores only.
const SAB_NZO_ID = /^[A-Za-z0-9_-]{1,64}$/;

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

function asSabNzoId(value: unknown): string | null {
  return typeof value === "string" && SAB_NZO_ID.test(value) ? value : null;
}

// NZBGet's NZBID is a positive integer; accept either number or string forms
// from the notification payload and normalize to string for the route.
function asNzbgetId(value: unknown): string | null {
  return asPositiveIntId(value);
}

function NotificationRouter() {
  const router = useRouter();

  useEffect(() => {
    function handleNotificationData(data: Record<string, unknown> | undefined) {
      if (!data?.type) return;

      // Notifications are global (you're alerted about every instance, on any
      // workspace). So before routing, switch to the first workspace that has
      // this alert's instance attached — otherwise the destination screen would
      // resolve to "not attached here" and look empty. No-op when the active
      // workspace already includes it (or none does).
      const instanceId =
        typeof data.instanceId === "string" ? data.instanceId : null;
      if (instanceId) {
        useConfigStore.getState().activateDashboardForInstance(instanceId);
      }

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
        case "transmission": {
          const hash = asTorrentHash(data.hash);
          if (hash) router.push(`/transmission/${hash}`);
          break;
        }
        case "sabnzbd": {
          const nzoId = asSabNzoId(data.nzoId);
          if (nzoId) router.push(`/sab/${nzoId}`);
          break;
        }
        case "nzbget": {
          const nzbId = asNzbgetId(data.nzbId);
          if (nzbId) router.push(`/nzb/${nzbId}`);
          break;
        }
        case "overseerr":
          router.push("/(tabs)/requests");
          break;
        case "tracearr":
          // All Tracearr webhook events (streams + alerts) surface in Activity.
          router.push("/(tabs)/activity");
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

function NetworkAutoSwitcher() {
  useNetworkAutoSwitch();
  return null;
}

const CONFIG_SYNC_DEBOUNCE_MS = 2000;

/**
 * Subscribes to config + notification stores and debounces a PUT /config to
 * the paired backend after any change. Only active while the backend is
 * paired (has a shared secret) — unpairing unsubscribes automatically.
 */
// NativeWind's `rem` is a global reactive observable; styles that resolve in
// rem units (every Tailwind text-* size, padding, gap, rounded radius, etc.)
// re-evaluate when it changes. Multiplying its base of 14 by uiScale gives us
// app-wide accessibility scaling without touching individual components.
function UiScaleBridge() {
  const uiScale = useConfigStore((s) => s.uiScale);
  useEffect(() => {
    rem.set(14 * uiScale);
  }, [uiScale]);
  return null;
}

// Keeps the native TLS-bypass allowlist in lockstep with config: which hosts
// the user opted out of certificate validation for. Pushes once on hydrate and
// again on every config change (the sync itself dedupes, so unrelated changes
// are cheap). Without this the native module would never learn the allowlist
// and every connection would validate certs normally.
function InsecureTlsBridge() {
  const configHydrated = useConfigStore((s) => s.hydrated);

  useEffect(() => {
    if (!configHydrated) return;
    syncInsecureHosts();
    const unsub = useConfigStore.subscribe(syncInsecureHosts);
    return unsub;
  }, [configHydrated]);

  return null;
}

function ConfigSyncBridge() {
  const sharedSecret = useBackendStore((s) => s.sharedSecret);
  const backendHydrated = useBackendStore((s) => s.hydrated);
  const configHydrated = useConfigStore((s) => s.hydrated);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!sharedSecret || !backendHydrated || !configHydrated) {
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

    return () => {
      unsubConfig();
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [sharedSecret, backendHydrated, configHydrated]);

  return null;
}

export default function RootLayout() {
  const hydrate = useConfigStore((s) => s.hydrate);
  const hydrated = useConfigStore((s) => s.hydrated);
  const demoMode = useConfigStore((s) => s.demoMode);
  const hydrateBackend = useBackendStore((s) => s.hydrate);
  const hydrateSort = useSortStore((s) => s.hydrate);
  const hydrateGlancesUi = useGlancesUiStore((s) => s.hydrate);
  const hydrateReleaseFilters = useReleaseFilterStore((s) => s.hydrate);
  const hydrateIntro = useIntroStore((s) => s.hydrate);
  const introHydrated = useIntroStore((s) => s.hydrated);
  const introSeen = useIntroStore((s) => s.workspaceIntroSeen);
  const introReplayVersion = useIntroStore((s) => s.showRequestVersion);
  const markIntroSeen = useIntroStore((s) => s.markWorkspaceIntroSeen);

  useEffect(() => {
    hydrate();
    hydrateBackend();
    configureNotifications();
  }, [hydrate, hydrateBackend]);

  // Sort prefs read sync from the storage cache, which is populated by
  // useConfigStore.hydrate(). Wait for that before reading.
  useEffect(() => {
    if (hydrated) {
      hydrateSort();
      hydrateGlancesUi();
      hydrateReleaseFilters();
      hydrateIntro();
    }
  }, [
    hydrated,
    hydrateSort,
    hydrateGlancesUi,
    hydrateReleaseFilters,
    hydrateIntro,
  ]);

  // Intro overlay visibility: never auto-open during Demo Mode (user is
  // exploring fake data; an overlay on top would be noise). Re-mounts when
  // `replayWorkspaceIntro()` bumps the version, so Settings → "Show
  // workspace tour" can replay without restarting the app.
  const showIntro =
    introHydrated && !introSeen && !demoMode;
  // introReplayVersion is intentionally read above to subscribe; the visible
  // flag toggles via introSeen which the replay action also clears.
  void introReplayVersion;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", onAppStateChange);
    return () => subscription.remove();
  }, []);

  if (!hydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <QueryClientProvider client={queryClient}>
            <ErrorBoundary>
              {/* Invisible root subscribers — isolated so a single failing
                  watcher (e.g. a service returning an unexpected payload) can't
                  unmount the navigator and trap the user on the fallback. */}
              <SilentErrorBoundary label="notification-watchers">
                <NotificationWatchers />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="notification-router">
                <NotificationRouter />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="backend-health">
                <BackendHealthPoller />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="network-auto-switch">
                <NetworkAutoSwitcher />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="config-sync">
                <ConfigSyncBridge />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="insecure-tls">
                <InsecureTlsBridge />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="ui-scale">
                <UiScaleBridge />
              </SilentErrorBoundary>
              <SilentErrorBoundary label="app-update-checker">
                <AppUpdateChecker />
              </SilentErrorBoundary>
              <StatusBar style="light" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: "#09090b" },
                  animation: "slide_from_right",
                }}
              />
              <WorkspaceIntroOverlay
                visible={showIntro}
                onDismiss={markIntroSeen}
              />
              <ToastContainer />
            </ErrorBoundary>
          </QueryClientProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}
