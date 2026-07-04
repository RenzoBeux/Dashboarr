import Constants from "expo-constants";
import type { WidgetTaskHandlerProps } from "react-native-android-widget";
import { CalendarWidget } from "@/widgets/calendar-widget";
import { fetchAgenda } from "@/widgets/fetch-agenda";

// The app URL scheme differs per variant (dashboarr / dashboarr-dev). Read it at
// runtime so deep links resolve into the right install; never hardcode.
export function resolveScheme(): string {
  const s = Constants.expoConfig?.scheme;
  return (Array.isArray(s) ? s[0] : s) ?? "dashboarr";
}

// Headless task invoked by the OS on widget add / periodic update / resize, and
// on tap. Registered at app entry (index.js) so a cold-started process has it
// before Android dispatches. Rendering data-driven actions re-fetches; clicks
// are handled natively by the library via clickAction="OPEN_URI".
export async function widgetTaskHandler(
  props: WidgetTaskHandlerProps,
): Promise<void> {
  const { widgetAction, renderWidget } = props;
  switch (widgetAction) {
    case "WIDGET_ADDED":
    case "WIDGET_UPDATE":
    case "WIDGET_RESIZED": {
      const vm = await fetchAgenda();
      renderWidget(<CalendarWidget {...vm} scheme={resolveScheme()} />);
      break;
    }
    case "WIDGET_CLICK":
    case "WIDGET_DELETED":
      break;
  }
}
