import { useConfigStore } from "@/store/config-store";
import { detectVpnActive } from "@/lib/vpn";
import { getJSON, setJSON } from "@/store/storage";
import { getDateOffset } from "@/lib/utils";
import { getCalendar as getSonarrCalendar } from "@/services/sonarr-api";
import { getCalendar as getRadarrCalendar } from "@/services/radarr-api";
import {
  buildAgenda,
  type AgendaItem,
  type InstanceCalendar,
} from "@/lib/calendar-agenda";
import type { RadarrMovie, SonarrCalendarEntry } from "@/lib/types";
import {
  DAYS_AHEAD,
  INCLUDE_RADARR,
  INCLUDE_SONARR,
  INCLUDE_UNMONITORED,
  LAST_AGENDA_KEY,
  MAX_ITEMS,
  RADARR_RELEASE_TYPE,
} from "@/widgets/widget-config";

export type WidgetState =
  | "ok"
  | "empty"
  | "not_configured"
  | "unavailable"
  | "error";

export interface WidgetViewModel {
  state: WidgetState;
  items: AgendaItem[];
}

function readLastAgenda(): AgendaItem[] {
  return getJSON<AgendaItem[]>(LAST_AGENDA_KEY) ?? [];
}

/**
 * Build the widget's view-model. Runs in BOTH the headless widget task (app
 * killed → fresh JS context) and the in-app foreground refresh, so it must
 * bootstrap the store itself and never throw.
 *
 * Security invariant: it reuses the exact same service layer + getActiveUrl the
 * app uses, so the local-only-when-home / remote-otherwise / never-leak-the-key
 * rules hold for free. In a fresh headless context `networkAwayFromHome`
 * defaults to `true` (safe → remote-only); the only way it serves a local URL
 * headless is the user's explicit VPN-as-home opt-in (below) or an auto-switch
 * that's turned off (in which case getActiveUrl returns local by the user's own
 * choice, exactly as the app does). We deliberately do NOT run background SSID
 * detection — Android restricts it and it would weaken the guard.
 */
export async function fetchAgenda(): Promise<WidgetViewModel> {
  try {
    if (!useConfigStore.getState().hydrated) {
      await useConfigStore.getState().hydrate();
    }

    const store = useConfigStore.getState();

    // VPN-as-home: the only safe way to permit a local URL headless. The tunnel
    // routes the private range to the user's own LAN, so there's no foreign-LAN
    // exposure — but only when they opted in and a tunnel is actually up.
    const vpn = detectVpnActive();
    store.setIsVpnActive(vpn);
    if (store.autoSwitchNetwork && store.treatVpnAsHome && vpn) {
      store.setNetworkAwayFromHome(false);
    }

    const sonarrInsts = INCLUDE_SONARR
      ? store.getEnabledInstances("sonarr")
      : [];
    const radarrInsts = INCLUDE_RADARR
      ? store.getEnabledInstances("radarr")
      : [];

    if (sonarrInsts.length === 0 && radarrInsts.length === 0) {
      return { state: "not_configured", items: [] };
    }

    // Only query instances that resolve to a non-empty URL in the current
    // network posture. When every instance resolves to "" (e.g. a LAN-only
    // setup while away, with no remote URL) the honest result is "unavailable"
    // — not an error and not a leak.
    const reachableSonarr = sonarrInsts.filter((i) =>
      store.getActiveUrl("sonarr", i.id),
    );
    const reachableRadarr = radarrInsts.filter((i) =>
      store.getActiveUrl("radarr", i.id),
    );
    if (reachableSonarr.length === 0 && reachableRadarr.length === 0) {
      return { state: "unavailable", items: [] };
    }

    const start = getDateOffset(-1);
    const end = getDateOffset(DAYS_AHEAD + 1);
    const opts = { unmonitored: INCLUDE_UNMONITORED };

    const [sonarrSettled, radarrSettled] = await Promise.all([
      Promise.allSettled(
        reachableSonarr.map((i) => getSonarrCalendar(start, end, opts, i.id)),
      ),
      Promise.allSettled(
        reachableRadarr.map((i) => getRadarrCalendar(start, end, opts, i.id)),
      ),
    ]);

    const sonarr: InstanceCalendar<SonarrCalendarEntry>[] = [];
    reachableSonarr.forEach((inst, idx) => {
      const r = sonarrSettled[idx];
      if (r.status === "fulfilled") {
        sonarr.push({ instanceId: inst.id, entries: r.value });
      }
    });
    const radarr: InstanceCalendar<RadarrMovie>[] = [];
    reachableRadarr.forEach((inst, idx) => {
      const r = radarrSettled[idx];
      if (r.status === "fulfilled") {
        radarr.push({ instanceId: inst.id, entries: r.value });
      }
    });

    // Every reachable instance failed → keep the last-known agenda rather than
    // blanking the widget on a transient blip.
    if (sonarr.length === 0 && radarr.length === 0) {
      return { state: "error", items: readLastAgenda() };
    }

    const items = buildAgenda({
      sonarr,
      radarr,
      daysAhead: DAYS_AHEAD,
      radarrReleaseType: RADARR_RELEASE_TYPE,
      maxItems: MAX_ITEMS,
    });

    setJSON(LAST_AGENDA_KEY, items);
    return { state: items.length ? "ok" : "empty", items };
  } catch {
    return { state: "error", items: readLastAgenda() };
  }
}
