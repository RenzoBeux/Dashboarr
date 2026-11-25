import SwiftUI
import WidgetKit

// Kind must match IOS_WIDGET_KIND in widgets/ios-widget.ts, which reloads it.
struct ReleasingSoonWidget: Widget {
  let kind = "ReleasingSoon"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: ReleasingSoonProvider()) { entry in
      ReleasingSoonWidgetView(entry: entry)
    }
    .configurationDisplayName("Releasing Soon")
    .description("Upcoming TV episodes and movie releases from Sonarr and Radarr.")
    .supportedFamilies([
      .systemSmall,
      .systemMedium,
      .systemLarge,
      .accessoryRectangular,
      .accessoryInline,
      .accessoryCircular,
    ])
  }
}

@main
struct DashboarrWidgets: WidgetBundle {
  var body: some Widget {
    ReleasingSoonWidget()
  }
}
