import type { LucideIcon } from "lucide-react-native";
import {
  LUCIDE_BY_NAME,
  type DashboardIconName,
} from "@/lib/dashboard-icons";
import type { TabRouteId } from "@/lib/tab-routes";

// Default lucide icon for each user-pickable middle tab. Values are names in
// the curated LUCIDE_BY_NAME registry (compiler-enforced) so the icon picker
// can highlight the effective default when no override is stored.
export const DEFAULT_TAB_ICON_NAMES: Record<TabRouteId, DashboardIconName> = {
  downloads: "Download",
  calendar: "CalendarDays",
  services: "LayoutGrid",
  movies: "Film",
  tv: "Tv",
  library: "Library",
  music: "Music",
  books: "BookOpen",
  requests: "Inbox",
  activity: "Activity",
  indexers: "Radar",
  plex: "PlayCircle",
  jellyfin: "Clapperboard",
  emby: "MonitorPlay",
  navidrome: "Disc",
  glances: "Cpu",
  bazarr: "Captions",
  unraid: "Server",
  tdarr: "Zap",
  autobrr: "Zap",
  cleanuparr: "Sparkles",
  // LUCIDE_BY_NAME (lib/dashboard-icons.ts) is a curated registry: it has
  // Shield but not ShieldBan/ShieldOff/Network, and adding one would also put
  // it in the user-facing dashboard icon picker.
  pihole: "Shield",
};

// Resolve the icon component for a tab, honoring a per-workspace override
// (a lucide name stored on Dashboard.tabIcons). Unknown or missing names
// fall back to the tab's default.
export function resolveTabIcon(
  tab: TabRouteId,
  override?: string,
): LucideIcon {
  if (override && override in LUCIDE_BY_NAME) {
    return LUCIDE_BY_NAME[override as DashboardIconName];
  }
  return LUCIDE_BY_NAME[DEFAULT_TAB_ICON_NAMES[tab]];
}
