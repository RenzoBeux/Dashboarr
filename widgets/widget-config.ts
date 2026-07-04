import type { RadarrReleaseType } from "@/lib/calendar-agenda";

// Fixed global config for the Android home-screen widget.
//
// Unlike the dashboard CalendarCard (per-slot, per-workspace settings resolved
// through React hooks), the OS widget is a single global surface with no React
// context, so it ships with sensible defaults mirroring CALENDAR_DEFAULT_SETTINGS
// (components/dashboard/widget-settings/calendar-settings.tsx). A user-facing
// widget config screen is a possible follow-up.

// Widget name — MUST match the `name` in the app.config.ts plugin block and the
// widgetName passed to requestWidgetUpdate.
export const WIDGET_NAME = "Calendar";

export const DAYS_AHEAD = 7;
export const RADARR_RELEASE_TYPE: RadarrReleaseType = "any";
export const INCLUDE_UNMONITORED = false;
export const INCLUDE_SONARR = true;
export const INCLUDE_RADARR = true;

// RemoteViews has a hard limit on view count / nesting depth, and every rendered
// bitmap counts against the ~1MB binder payload — keep the agenda compact.
export const MAX_ITEMS = 8;

// Last successfully-built agenda, rendered on a transient fetch failure so a
// network blip doesn't blank the widget.
export const LAST_AGENDA_KEY = "widget.calendar.lastAgenda";
