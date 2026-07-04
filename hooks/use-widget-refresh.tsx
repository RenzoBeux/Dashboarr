import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import { requestWidgetUpdate } from "react-native-android-widget";
import { useConfigStore } from "@/store/config-store";
import { queryClient } from "@/lib/query-client";
import { fetchAgenda } from "@/widgets/fetch-agenda";
import { CalendarWidget } from "@/widgets/calendar-widget";
import { resolveScheme } from "@/widgets/widget-task-handler";
import { WIDGET_NAME } from "@/widgets/widget-config";

// Keeps any placed Android widget fresh while the app is used: pushes an update
// on foreground and shortly after the in-app calendar queries settle. This is
// the *reliable* refresh path (the OS 30-min updatePeriodMillis is best-effort
// and OEM battery savers suppress it). requestWidgetUpdate only invokes
// renderWidget when a widget is actually on the home screen, so fetchAgenda
// doesn't run otherwise.

const DEBOUNCE_MS = 2000;

function isCalendarQueryKey(key: readonly unknown[]): boolean {
  return (
    (key[0] === "sonarr" || key[0] === "radarr") && key.includes("calendar")
  );
}

export function useWidgetRefresh() {
  const hydrated = useConfigStore((s) => s.hydrated);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "android" || !hydrated) return;

    const pushUpdate = () => {
      void requestWidgetUpdate({
        widgetName: WIDGET_NAME,
        renderWidget: async () => {
          const vm = await fetchAgenda();
          return <CalendarWidget {...vm} scheme={resolveScheme()} />;
        },
        widgetNotFound: () => {},
      }).catch(() => {});
    };

    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(pushUpdate, DEBOUNCE_MS);
    };

    // Initial push so opening the app refreshes any placed widget.
    schedule();

    const unsub = queryClient.getQueryCache().subscribe((event) => {
      const key = event?.query?.queryKey;
      if (Array.isArray(key) && isCalendarQueryKey(key)) schedule();
    });

    const appStateSub = AppState.addEventListener("change", (status) => {
      // Debounce covers the concurrent evaluateHomeNetwork() on resume, so the
      // pushed data reflects the correct home/away URL posture.
      if (status === "active") schedule();
    });

    return () => {
      unsub();
      appStateSub.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [hydrated]);
}
