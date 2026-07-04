import { FlexWidget, ImageWidget, TextWidget } from "react-native-android-widget";
import type { AgendaItem } from "@/lib/calendar-agenda";
import type { WidgetState } from "@/widgets/fetch-agenda";
import { DAYS_AHEAD } from "@/widgets/widget-config";

// The Android home-screen ("Releasing Soon") widget, rendered to RemoteViews via
// react-native-android-widget. Uses only the library's primitives — NativeWind,
// lucide, and expo-image do NOT apply to RemoteViews. Colors are inline hex from
// the app palette (matches components/common/calendar-event-row.tsx).

const COLORS = {
  surface: "#09090b" as const,
  title: "#fafafa" as const,
  muted: "#a1a1aa" as const,
  faint: "#71717a" as const,
  placeholder: "#27272a" as const,
};

type HexColor = `#${string}`;

// expo-router parses the empty-host form (scheme:///path). `route` already
// starts with "/", so `${scheme}://${route}` yields the triple-slash form.
function deepLink(scheme: string, route: string): string {
  return `${scheme}://${route}`;
}

function Row({ item, scheme }: { item: AgendaItem; scheme: string }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink(scheme, item.route) }}
      style={{
        width: "match_parent",
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 5,
      }}
    >
      <FlexWidget
        style={{
          width: 3,
          height: 42,
          borderRadius: 2,
          backgroundColor: item.barColor as HexColor,
        }}
      />
      {item.posterUrl ? (
        <ImageWidget
          image={item.posterUrl as `https:${string}`}
          imageWidth={30}
          imageHeight={42}
          radius={4}
          style={{ marginLeft: 8 }}
        />
      ) : (
        <FlexWidget
          style={{
            width: 30,
            height: 42,
            borderRadius: 4,
            marginLeft: 8,
            backgroundColor: COLORS.placeholder,
          }}
        />
      )}
      <FlexWidget
        style={{
          flex: 1,
          flexDirection: "column",
          marginLeft: 8,
        }}
      >
        <TextWidget
          text={item.title}
          maxLines={1}
          truncate="END"
          style={{ color: COLORS.title, fontSize: 13, fontWeight: "500" }}
        />
        <TextWidget
          text={item.subtitle}
          maxLines={1}
          truncate="END"
          style={{ color: COLORS.muted, fontSize: 11, marginTop: 1 }}
        />
      </FlexWidget>
      <TextWidget
        text={item.dateLabel}
        maxLines={1}
        style={{ color: COLORS.muted, fontSize: 11, marginLeft: 6 }}
      />
    </FlexWidget>
  );
}

function Message({ text }: { text: string }) {
  return (
    <FlexWidget
      style={{
        width: "match_parent",
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        paddingVertical: 12,
      }}
    >
      <TextWidget
        text={text}
        style={{ color: COLORS.faint, fontSize: 12, textAlign: "center" }}
      />
    </FlexWidget>
  );
}

const MESSAGES: Record<Exclude<WidgetState, "ok">, string> = {
  empty: `Nothing releasing in the next ${DAYS_AHEAD} days`,
  not_configured: "Add Sonarr or Radarr in Dashboarr to see releases",
  unavailable: "Releases unavailable. Add a Remote URL in Dashboarr",
  error: "Couldn't refresh. Tap to open Dashboarr",
};

export function CalendarWidget({
  state,
  items,
  scheme,
}: {
  state: WidgetState;
  items: AgendaItem[];
  scheme: string;
}) {
  // "error" still renders the last-known agenda when we have one (stale but
  // useful); it only falls back to the message when there's nothing cached.
  const showRows = (state === "ok" || state === "error") && items.length > 0;

  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: deepLink(scheme, "/calendar") }}
      style={{
        height: "match_parent",
        width: "match_parent",
        flexDirection: "column",
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <FlexWidget
        style={{
          width: "match_parent",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <TextWidget
          text="Releasing Soon"
          style={{ color: COLORS.title, fontSize: 15, fontWeight: "bold" }}
        />
        {showRows ? (
          <TextWidget
            text={`${items.length} ${items.length === 1 ? "release" : "releases"}`}
            style={{ color: COLORS.faint, fontSize: 12 }}
          />
        ) : (
          <FlexWidget style={{ width: 0, height: 0 }} />
        )}
      </FlexWidget>

      {showRows ? (
        <FlexWidget style={{ width: "match_parent", flexDirection: "column" }}>
          {items.map((item) => (
            <Row key={item.id} item={item} scheme={scheme} />
          ))}
        </FlexWidget>
      ) : (
        <Message text={MESSAGES[state === "ok" ? "empty" : state]} />
      )}
    </FlexWidget>
  );
}
