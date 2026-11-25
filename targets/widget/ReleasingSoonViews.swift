import SwiftUI
import WidgetKit

enum ReleasingSoonLayout {
  // List rows per family. 0 = no list (Lock Screen, Small).
  static func rows(for family: WidgetFamily) -> Int {
    switch family {
    case .systemMedium: return 3
    case .systemLarge: return 7
    case .systemExtraLarge: return 7
    default: return 0
    }
  }
}

// Everything the views need from one entry.
struct ReleasingSoonModel {
  let now: Date
  let items: [ReleasingSoonItem]
  // Shown instead of rows when there is nothing to list.
  let message: String?
  let scheme: String
  let posters: [String: CGImage]

  init(entry: ReleasingSoonEntry) {
    now = entry.date
    posters = entry.posters
    guard let snapshot = entry.snapshot else {
      items = []
      message = "Open Dashboarr to load upcoming releases"
      scheme = "dashboarr"
      return
    }
    scheme = snapshot.scheme
    let upcoming = ReleasingSoonDates.upcoming(snapshot.items, now: now)
    // "error" keeps showing the last agenda the app managed to build, like the
    // Android widget.
    if !upcoming.isEmpty && (snapshot.state == "ok" || snapshot.state == "error") {
      items = upcoming
      message = nil
      return
    }
    items = []
    switch snapshot.state {
    case "not_configured": message = "Add Sonarr or Radarr in Dashboarr to see releases"
    case "unavailable": message = "Releases unavailable. Add a Remote URL in Dashboarr"
    case "error": message = "Couldn't refresh. Open Dashboarr to try again"
    default:
      // Everything listed has passed since the app last refreshed.
      message = snapshot.items.isEmpty
        ? "Nothing releasing in the next \(snapshot.daysAhead) days"
        : "Open Dashboarr to refresh releases"
    }
  }

  func link(_ route: String) -> URL? {
    URL(string: "\(scheme)://\(route)")
  }

  func label(_ item: ReleasingSoonItem) -> String {
    ReleasingSoonDates.label(item.dateKey, now: now)
  }

  var todayCount: Int {
    items.filter { ReleasingSoonDates.daysFrom(now, to: $0.dateKey) == 0 }.count
  }
}

struct ReleasingSoonWidgetView: View {
  @Environment(\.widgetFamily) private var family
  let entry: ReleasingSoonEntry

  var body: some View {
    ReleasingSoonContent(model: ReleasingSoonModel(entry: entry), family: family)
      .containerBackground(for: .widget) {
        Color("widgetSurface")
      }
  }
}

// Split from the WidgetKit wrapper so it can render with an explicit family.
struct ReleasingSoonContent: View {
  let model: ReleasingSoonModel
  let family: WidgetFamily

  var body: some View {
    switch family {
    case .accessoryInline: InlineView(model: model)
    case .accessoryCircular: CircularView(model: model)
    case .accessoryRectangular: RectangularView(model: model)
    case .systemSmall: SmallView(model: model)
    default: ListView(model: model, rows: ReleasingSoonLayout.rows(for: family), large: family != .systemMedium)
    }
  }
}

private struct Header: View {
  let model: ReleasingSoonModel

  var body: some View {
    HStack(alignment: .firstTextBaseline) {
      Text("Releasing Soon")
        .font(.subheadline.weight(.bold))
      Spacer(minLength: 4)
      if !model.items.isEmpty {
        Text("\(model.items.count) \(model.items.count == 1 ? "release" : "releases")")
          .font(.caption2)
          .foregroundStyle(.secondary)
      }
    }
  }
}

private struct Message: View {
  let text: String

  var body: some View {
    Text(text)
      .font(.caption)
      .foregroundStyle(.secondary)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

// The status spine from the app's calendar rows (BAR_KIND_COLOR).
private struct Spine: View {
  let hex: String
  let height: CGFloat

  var body: some View {
    RoundedRectangle(cornerRadius: 1.5)
      .fill(Color(hex: hex) ?? .accentColor)
      .frame(width: 3, height: height)
      .widgetAccentable()
  }
}

private struct SmallView: View {
  let model: ReleasingSoonModel

  var body: some View {
    VStack(alignment: .leading, spacing: 6) {
      Text("Releasing Soon")
        .font(.caption.weight(.bold))
        .foregroundStyle(.secondary)
      if let message = model.message {
        Message(text: message)
      } else {
        ForEach(model.items.prefix(2)) { item in
          HStack(alignment: .top, spacing: 6) {
            Spine(hex: item.barColor, height: 34)
            VStack(alignment: .leading, spacing: 1) {
              Text(model.label(item))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
              Text(item.title)
                .font(.footnote.weight(.semibold))
                .lineLimit(2)
            }
          }
        }
        Spacer(minLength: 0)
        if model.items.count > 2 {
          Text("+\(model.items.count - 2) more")
            .font(.caption2)
            .foregroundStyle(.secondary)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(model.link("/calendar"))
  }
}

private struct ListView: View {
  let model: ReleasingSoonModel
  let rows: Int
  let large: Bool

  var body: some View {
    VStack(alignment: .leading, spacing: large ? 4 : 2) {
      Header(model: model)
        .padding(.bottom, 2)
      if let message = model.message {
        Message(text: message)
      } else {
        ForEach(model.items.prefix(rows)) { item in
          if let url = model.link(item.route) {
            Link(destination: url) { Row(model: model, item: item, large: large) }
          } else {
            Row(model: model, item: item, large: large)
          }
        }
        Spacer(minLength: 0)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .widgetURL(model.link("/calendar"))
  }
}

private struct Row: View {
  let model: ReleasingSoonModel
  let item: ReleasingSoonItem
  let large: Bool

  var body: some View {
    let posterHeight: CGFloat = large ? 36 : 30
    HStack(spacing: 8) {
      Spine(hex: item.barColor, height: posterHeight)
      Group {
        if let poster = model.posters[item.id] {
          Image(decorative: poster, scale: 1)
            .resizable()
            .aspectRatio(contentMode: .fill)
        } else {
          Rectangle().fill(.quaternary)
        }
      }
      .frame(width: posterHeight * 2 / 3, height: posterHeight)
      .clipShape(RoundedRectangle(cornerRadius: 4))
      VStack(alignment: .leading, spacing: 1) {
        Text(item.title)
          .font(.footnote.weight(.semibold))
          .lineLimit(1)
        Text(item.subtitle)
          .font(.caption2)
          .foregroundStyle(.secondary)
          .lineLimit(1)
      }
      Spacer(minLength: 4)
      Text(model.label(item))
        .font(.caption2)
        .foregroundStyle(.secondary)
        .lineLimit(1)
    }
    // A Link tints its label with the accent color; rows read as plain text.
    .foregroundStyle(Color.primary)
  }
}

private struct RectangularView: View {
  let model: ReleasingSoonModel

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      if let first = model.items.first {
        Text(model.label(first))
          .font(.headline)
          .widgetAccentable()
        Text(first.title)
          .lineLimit(1)
        if model.items.count > 1 {
          let second = model.items[1]
          Text("\(model.label(second)): \(second.title)")
            .foregroundStyle(.secondary)
            .lineLimit(1)
        }
      } else {
        Text("Releasing Soon")
          .font(.headline)
          .widgetAccentable()
        Text(model.message ?? "")
          .font(.caption)
          .lineLimit(2)
      }
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .widgetURL(model.link(model.items.first?.route ?? "/calendar"))
  }
}

private struct InlineView: View {
  let model: ReleasingSoonModel

  var body: some View {
    if let first = model.items.first {
      Label("\(model.label(first)): \(first.title)", systemImage: "calendar")
        .widgetURL(model.link(first.route))
    } else {
      Label("No upcoming releases", systemImage: "calendar")
        .widgetURL(model.link("/calendar"))
    }
  }
}

// How many releases land today.
private struct CircularView: View {
  let model: ReleasingSoonModel

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: -2) {
        Text("\(model.todayCount)")
          .font(.title2.weight(.bold))
          .widgetAccentable()
        Text("today")
          .font(.caption2)
      }
    }
    .widgetURL(model.link("/calendar"))
  }
}

extension Color {
  // #rrggbb from the app palette.
  init?(hex: String) {
    let digits = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
    guard digits.count == 6, let value = UInt32(digits, radix: 16) else { return nil }
    self.init(
      red: Double((value >> 16) & 0xff) / 255,
      green: Double((value >> 8) & 0xff) / 255,
      blue: Double(value & 0xff) / 255)
  }
}
