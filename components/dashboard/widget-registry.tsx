import {
  Activity,
  CalendarDays,
  Captions,
  Cpu,
  Download,
  Film,
  Gauge,
  HeartPulse,
  Inbox,
  PlayCircle,
  Power,
  Radar,
  type LucideIcon,
} from "lucide-react-native";
import { ServerStatsCard } from "@/components/dashboard/server-stats-card";
import { SpeedStatsCard } from "@/components/dashboard/speed-stats-card";
import { ServiceHealthCard } from "@/components/dashboard/service-health-card";
import { DownloadCard } from "@/components/dashboard/download-card";
import { RadarrQueueCard } from "@/components/dashboard/radarr-queue-card";
import { CalendarCard } from "@/components/dashboard/calendar-card";
import { TautulliActivityCard } from "@/components/dashboard/tautulli-activity-card";
import { OverseerrRequestsCard } from "@/components/dashboard/overseerr-requests-card";
import { PlexNowPlayingCard } from "@/components/dashboard/plex-now-playing-card";
import { ProwlarrStatsCard } from "@/components/dashboard/prowlarr-stats-card";
import { BazarrWantedCard } from "@/components/dashboard/bazarr-wanted-card";
import { WolDevicesCard } from "@/components/dashboard/wol-devices-card";
import {
  ServerStatsSettings,
  SERVER_STATS_DEFAULT_SETTINGS,
  type ServerStatsSettingsValue,
} from "@/components/dashboard/widget-settings/server-stats-settings";
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
  PlexNowPlayingSettings,
  PLEX_NOW_PLAYING_DEFAULT_SETTINGS,
  type PlexNowPlayingSettingsValue,
} from "@/components/dashboard/widget-settings/plex-now-playing-settings";
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
import { DASHBOARD_WIDGET_IDS, type ServiceId, type WidgetId } from "@/lib/constants";

export interface WidgetSettingsComponentProps {
  onClose: () => void;
}

export interface WidgetDefinition {
  id: WidgetId;
  label: string;
  description: string;
  icon: LucideIcon;
  // Service this widget needs configured. `null` means the widget renders
  // regardless of which services are enabled (e.g. service-health, calendar
  // which can show Sonarr, Radarr, or both).
  service: ServiceId | null;
  component: React.ComponentType;
  // If provided, the dashboard renders a gear icon in edit mode that opens
  // this component inside the WidgetSettingsSheet.
  settingsComponent?: React.ComponentType<WidgetSettingsComponentProps>;
  // Frozen defaults the widget falls back to when no settings have been saved.
  // Lives here (not in the widget itself) so the registry can describe a
  // widget without rendering it — useful for the settings sheet picker.
  defaultSettings?: Record<string, unknown>;
}

export const WIDGET_REGISTRY: Record<WidgetId, WidgetDefinition> = {
  "service-health": {
    id: "service-health",
    label: "Service Health",
    description: "Status grid of all enabled services",
    icon: HeartPulse,
    service: null,
    component: ServiceHealthCard,
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
    service: "qbittorrent",
    component: SpeedStatsCard,
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
  "radarr-queue": {
    id: "radarr-queue",
    label: "Radarr Queue",
    description: "Movies currently downloading or grabbed",
    icon: Film,
    service: "radarr",
    component: RadarrQueueCard,
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
    label: "Overseerr Requests",
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
  "prowlarr-stats": {
    id: "prowlarr-stats",
    label: "Prowlarr Stats",
    description: "Indexer health and query stats",
    icon: Radar,
    service: "prowlarr",
    component: ProwlarrStatsCard,
  },
  "bazarr-wanted": {
    id: "bazarr-wanted",
    label: "Bazarr Wanted",
    description: "Missing subtitles across your library",
    icon: Captions,
    service: "bazarr",
    component: BazarrWantedCard,
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

export function getAvailableWidgets(currentIds: WidgetId[]): WidgetDefinition[] {
  const current = new Set(currentIds);
  return DASHBOARD_WIDGET_IDS.filter((id) => !current.has(id)).map(
    (id) => WIDGET_REGISTRY[id],
  );
}

export type {
  ServerStatsSettingsValue,
  CalendarSettingsValue,
  DownloadsSettingsValue,
  PlexNowPlayingSettingsValue,
  TautulliActivitySettingsValue,
  OverseerrRequestsSettingsValue,
};
