import {
  Activity,
  CalendarDays,
  Captions,
  Clapperboard,
  Cpu,
  Download,
  Film,
  Gauge,
  HeartPulse,
  Inbox,
  MonitorPlay,
  Newspaper,
  PlayCircle,
  Power,
  Radar,
  type LucideIcon,
} from "lucide-react-native";
import { ServerStatsCard } from "@/components/dashboard/server-stats-card";
import { SpeedStatsCard } from "@/components/dashboard/speed-stats-card";
import { ServiceHealthCard } from "@/components/dashboard/service-health-card";
import { DownloadCard } from "@/components/dashboard/download-card";
import { SabnzbdQueueCard } from "@/components/dashboard/sabnzbd-queue-card";
import { NzbgetQueueCard } from "@/components/dashboard/nzbget-queue-card";
import { RadarrQueueCard } from "@/components/dashboard/radarr-queue-card";
import { CalendarCard } from "@/components/dashboard/calendar-card";
import { TautulliActivityCard } from "@/components/dashboard/tautulli-activity-card";
import { OverseerrRequestsCard } from "@/components/dashboard/overseerr-requests-card";
import { PlexNowPlayingCard } from "@/components/dashboard/plex-now-playing-card";
import { JellyfinNowPlayingCard } from "@/components/dashboard/jellyfin-now-playing-card";
import { EmbyNowPlayingCard } from "@/components/dashboard/emby-now-playing-card";
import { ProwlarrStatsCard } from "@/components/dashboard/prowlarr-stats-card";
import { BazarrWantedCard } from "@/components/dashboard/bazarr-wanted-card";
import { WolDevicesCard } from "@/components/dashboard/wol-devices-card";
import {
  ServerStatsSettings,
  SERVER_STATS_DEFAULT_SETTINGS,
  type ServerStatsSettingsValue,
} from "@/components/dashboard/widget-settings/server-stats-settings";
import {
  ServiceHealthSettings,
  SERVICE_HEALTH_DEFAULT_SETTINGS,
  type ServiceHealthSettingsValue,
} from "@/components/dashboard/widget-settings/service-health-settings";
import {
  CalendarSettings,
  CALENDAR_DEFAULT_SETTINGS,
  type CalendarSettingsValue,
} from "@/components/dashboard/widget-settings/calendar-settings";
import {
  DownloadsSettings,
  DOWNLOADS_DEFAULT_SETTINGS,
  type DownloadsSettingsValue,
} from "@/components/dashboard/widget-settings/downloads-settings";
import {
  SabnzbdQueueSettings,
  SABNZBD_QUEUE_DEFAULT_SETTINGS,
  type SabnzbdQueueSettingsValue,
} from "@/components/dashboard/widget-settings/sabnzbd-queue-settings";
import {
  NzbgetQueueSettings,
  NZBGET_QUEUE_DEFAULT_SETTINGS,
  type NzbgetQueueSettingsValue,
} from "@/components/dashboard/widget-settings/nzbget-queue-settings";
import {
  PlexNowPlayingSettings,
  PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  type PlexNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/plex-now-playing-settings";
import {
  JellyfinNowPlayingSettings,
  JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS,
  type JellyfinNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/jellyfin-now-playing-settings";
import {
  EmbyNowPlayingSettings,
  EMBY_NOW_PLAYING_DEFAULT_SETTINGS,
  type EmbyNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/emby-now-playing-settings";
import {
  TautulliActivitySettings,
  TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  type TautulliActivitySettingsValue,
} from "@/components/dashboard/widget-settings/tautulli-activity-settings";
import {
  OverseerrRequestsSettings,
  OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  type OverseerrRequestsSettingsValue,
} from "@/components/dashboard/widget-settings/overseerr-requests-settings";
import {
  SpeedStatsSettings,
  SPEED_STATS_DEFAULT_SETTINGS,
  type SpeedStatsSettingsValue,
} from "@/components/dashboard/widget-settings/speed-stats-settings";
import {
  RadarrQueueSettings,
  RADARR_QUEUE_DEFAULT_SETTINGS,
  type RadarrQueueSettingsValue,
} from "@/components/dashboard/widget-settings/radarr-queue-settings";
import {
  ProwlarrStatsSettings,
  PROWLARR_STATS_DEFAULT_SETTINGS,
  type ProwlarrStatsSettingsValue,
} from "@/components/dashboard/widget-settings/prowlarr-stats-settings";
import {
  BazarrWantedSettings,
  BAZARR_WANTED_DEFAULT_SETTINGS,
  type BazarrWantedSettingsValue,
} from "@/components/dashboard/widget-settings/bazarr-wanted-settings";
import { DASHBOARD_WIDGET_IDS, type ServiceId, type WidgetId } from "@/lib/constants";

// Every widget component receives the id of its slot in the active dashboard.
// The slot id keys per-slot settings (via useWidgetSettings) and lets two
// instances of the same widget on different dashboards keep distinct settings
// (e.g. Downloads bound to qBit-Home vs qBit-Cabin).
export interface WidgetComponentProps {
  slotId: string;
}

export interface WidgetSettingsComponentProps {
  slotId: string;
  onClose: () => void;
}

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  description: string;
  icon: LucideIcon;
  // Service(s) this widget needs configured. `null` means the widget renders
  // regardless of which services are enabled (e.g. service-health, calendar
  // which can show Sonarr, Radarr, or both). An array means "any of these" —
  // used by Speed Stats which can fold in qBittorrent, SABnzbd, or both.
  service: ServiceId | ServiceId[] | null;
  component: React.ComponentType<WidgetComponentProps>;
  // If provided, the dashboard renders a gear icon in edit mode that opens
  // this component inside the WidgetSettingsSheet.
  settingsComponent?: React.ComponentType<WidgetSettingsComponentProps>;
  // Frozen defaults the widget falls back to when no settings have been saved.
  // Lives here (not in the widget itself) so the registry can describe a
  // widget without rendering it — useful for the settings sheet picker.
  defaultSettings?: Record<string, unknown>;
}

/**
 * Whether the widget's service requirement is satisfied by the current set of
 * enabled services. Folds the three possible shapes — `null` (no requirement),
 * a single id, or "any of these ids" — into one boolean check so callers
 * (dashboard visibility, add-widget filter) don't need to branch on shape.
 */
export function isWidgetServiceEnabled(
  widget: WidgetDefinition,
  services: Record<ServiceId, { enabled: boolean }>,
): boolean {
  if (widget.service === null) return true;
  if (Array.isArray(widget.service)) {
    return widget.service.some((id) => services[id].enabled);
  }
  return services[widget.service].enabled;
}

/**
 * Whether the widget's service requirement intersects the active dashboard's
 * attached service set. Widgets with `service === null` (service-health,
 * calendar, wol-devices) are workspace-agnostic and always pass. Used by the
 * dashboard visibility filter and the Add Widget picker to keep each
 * workspace's widget list scoped to its attached services.
 */
export function isWidgetServiceAttached(
  widget: WidgetDefinition,
  attached: ReadonlySet<ServiceId>,
): boolean {
  if (widget.service === null) return true;
  if (Array.isArray(widget.service)) {
    return widget.service.some((id) => attached.has(id));
  }
  return attached.has(widget.service);
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  "service-health": {
    id: "service-health",
    label: "Service Health",
    description: "Status grid of all enabled services",
    icon: HeartPulse,
    service: null,
    component: ServiceHealthCard,
    settingsComponent: ServiceHealthSettings,
    defaultSettings: SERVICE_HEALTH_DEFAULT_SETTINGS,
  },
  "server-stats": {
    id: "server-stats",
    label: "Server Stats",
    description: "CPU, RAM and disk usage from Glances",
    icon: Cpu,
    service: "glances",
    component: ServerStatsCard,
    settingsComponent: ServerStatsSettings,
    defaultSettings: SERVER_STATS_DEFAULT_SETTINGS,
  },
  "speed-stats": {
    id: "speed-stats",
    label: "Speed Stats",
    description: "Live download and upload speeds",
    icon: Gauge,
    service: ["qbittorrent", "sabnzbd"],
    component: SpeedStatsCard,
    settingsComponent: SpeedStatsSettings,
    defaultSettings: SPEED_STATS_DEFAULT_SETTINGS,
  },
  "downloads": {
    id: "downloads",
    label: "Downloads",
    description: "Top active torrents with pause and resume",
    icon: Download,
    service: "qbittorrent",
    component: DownloadCard,
    settingsComponent: DownloadsSettings,
    defaultSettings: DOWNLOADS_DEFAULT_SETTINGS,
  },
  "sabnzbd-queue": {
    id: "sabnzbd-queue",
    label: "SABnzbd Queue",
    description: "Top active Usenet downloads",
    icon: Newspaper,
    service: "sabnzbd",
    component: SabnzbdQueueCard,
    settingsComponent: SabnzbdQueueSettings,
    defaultSettings: SABNZBD_QUEUE_DEFAULT_SETTINGS,
  },
  "nzbget-queue": {
    id: "nzbget-queue",
    label: "NZBGet Queue",
    description: "Top active Usenet downloads",
    icon: Newspaper,
    service: "nzbget",
    component: NzbgetQueueCard,
    settingsComponent: NzbgetQueueSettings,
    defaultSettings: NZBGET_QUEUE_DEFAULT_SETTINGS,
  },
  "radarr-queue": {
    id: "radarr-queue",
    label: "Radarr Queue",
    description: "Movies currently downloading or grabbed",
    icon: Film,
    service: "radarr",
    component: RadarrQueueCard,
    settingsComponent: RadarrQueueSettings,
    defaultSettings: RADARR_QUEUE_DEFAULT_SETTINGS,
  },
  "calendar": {
    id: "calendar",
    label: "Calendar",
    description: "Upcoming releases from Sonarr and Radarr",
    icon: CalendarDays,
    service: null,
    component: CalendarCard,
    settingsComponent: CalendarSettings,
    defaultSettings: CALENDAR_DEFAULT_SETTINGS,
  },
  "tautulli-activity": {
    id: "tautulli-activity",
    label: "Tautulli Activity",
    description: "Current Plex streams and bandwidth",
    icon: Activity,
    service: "tautulli",
    component: TautulliActivityCard,
    settingsComponent: TautulliActivitySettings,
    defaultSettings: TAUTULLI_ACTIVITY_DEFAULT_SETTINGS,
  },
  "overseerr-requests": {
    id: "overseerr-requests",
    label: "Seerr Requests",
    description: "Recent media requests with status",
    icon: Inbox,
    service: "overseerr",
    component: OverseerrRequestsCard,
    settingsComponent: OverseerrRequestsSettings,
    defaultSettings: OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  },
  "plex-now-playing": {
    id: "plex-now-playing",
    label: "Plex Now Playing",
    description: "Live playback sessions on your Plex server",
    icon: PlayCircle,
    service: "plex",
    component: PlexNowPlayingCard,
    settingsComponent: PlexNowPlayingSettings,
    defaultSettings: PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  },
  "jellyfin-now-playing": {
    id: "jellyfin-now-playing",
    label: "Jellyfin Now Playing",
    description: "Live playback sessions on your Jellyfin server",
    icon: Clapperboard,
    service: "jellyfin",
    component: JellyfinNowPlayingCard,
    settingsComponent: JellyfinNowPlayingSettings,
    defaultSettings: JELLYFIN_NOW_PLAYING_DEFAULT_SETTINGS,
  },
  "emby-now-playing": {
    id: "emby-now-playing",
    label: "Emby Now Playing",
    description: "Live playback sessions on your Emby server",
    icon: MonitorPlay,
    service: "emby",
    component: EmbyNowPlayingCard,
    settingsComponent: EmbyNowPlayingSettings,
    defaultSettings: EMBY_NOW_PLAYING_DEFAULT_SETTINGS,
  },
  "prowlarr-stats": {
    id: "prowlarr-stats",
    label: "Prowlarr Stats",
    description: "Indexer health and query stats",
    icon: Radar,
    service: "prowlarr",
    component: ProwlarrStatsCard,
    settingsComponent: ProwlarrStatsSettings,
    defaultSettings: PROWLARR_STATS_DEFAULT_SETTINGS,
  },
  "bazarr-wanted": {
    id: "bazarr-wanted",
    label: "Bazarr Wanted",
    description: "Missing subtitles across your library",
    icon: Captions,
    service: "bazarr",
    component: BazarrWantedCard,
    settingsComponent: BazarrWantedSettings,
    defaultSettings: BAZARR_WANTED_DEFAULT_SETTINGS,
  },
  "wol-devices": {
    id: "wol-devices",
    label: "Wake-on-LAN",
    description: "One-tap wake for saved devices",
    icon: Power,
    service: null,
    component: WolDevicesCard,
  },
};

// Lists widgets the user can still add. With per-slot dashboards a user can
// place the same widget more than once (e.g. two Downloads cards bound to
// different qBit instances), so we list every registered widget and let the
// store deduplicate via slot ids.
export function getAvailableWidgets(): WidgetDefinition[] {
  return DASHBOARD_WIDGET_IDS.map((id) => WIDGET_REGISTRY[id]);
}

export type {
  ServerStatsSettingsValue,
  ServiceHealthSettingsValue,
  CalendarSettingsValue,
  DownloadsSettingsValue,
  SabnzbdQueueSettingsValue,
  NzbgetQueueSettingsValue,
  PlexNowPlayingSettingsValue,
  JellyfinNowPlayingSettingsValue,
  EmbyNowPlayingSettingsValue,
  TautulliActivitySettingsValue,
  OverseerrRequestsSettingsValue,
  SpeedStatsSettingsValue,
  RadarrQueueSettingsValue,
  ProwlarrStatsSettingsValue,
  BazarrWantedSettingsValue,
};
