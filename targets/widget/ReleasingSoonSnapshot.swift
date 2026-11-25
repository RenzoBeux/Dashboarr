import Foundation

// What the app publishes for the widget: widgets/ios-widget-snapshot.ts builds
// it from the same agenda as the Android widget (widgets/fetch-agenda.ts) and
// writes it as JSON under `ReleasingSoonStore.key` in the App Group.
struct ReleasingSoonSnapshot: Decodable {
  let v: Int
  // ok | empty | not_configured | unavailable | error (WidgetState)
  let state: String
  // Epoch milliseconds.
  let generatedAt: Double
  // dashboarr / dashboarr-dev, for deep links back into the right install.
  let scheme: String
  let daysAhead: Int
  let items: [ReleasingSoonItem]
}

struct ReleasingSoonItem: Decodable, Identifiable, Hashable {
  let id: String
  // episode | movie
  let kind: String
  let title: String
  let subtitle: String
  // Local YYYY-MM-DD. Labels are computed here, against the entry's date, so
  // they stay right while the app is closed.
  let dateKey: String
  // Public TMDB/TVDB artwork only (lib/calendar-agenda.ts widgetPosterUrl).
  let posterUrl: String?
  let barColor: String
  let hasFile: Bool
  // In-app route, e.g. /movie/45?instanceId=abc.
  let route: String
}

enum ReleasingSoonStore {
  static let key = "releasingSoon"

  // group.<app bundle id>. The widget's bundle id is the app's plus ".widget"
  // (expo-target.config.js) and app.config.ts names the group after the app,
  // which keeps the Dev and production widgets on their own data.
  static var appGroup: String {
    let id = Bundle.main.bundleIdentifier ?? "com.dashboarr.app.widget"
    let suffix = ".widget"
    let app = id.hasSuffix(suffix) ? String(id.dropLast(suffix.count)) : id
    return "group.\(app)"
  }

  static func load() -> ReleasingSoonSnapshot? {
    guard
      let json = UserDefaults(suiteName: appGroup)?.string(forKey: key),
      let data = json.data(using: .utf8)
    else { return nil }
    return try? JSONDecoder().decode(ReleasingSoonSnapshot.self, from: data)
  }
}

enum ReleasingSoonDates {
  static func day(_ key: String, calendar: Calendar = .current) -> Date? {
    let parts = key.split(separator: "-").compactMap { Int($0) }
    guard parts.count == 3 else { return nil }
    return calendar.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2]))
  }

  // Whole days from `now`'s day to the item's day (0 = today).
  static func daysFrom(_ now: Date, to key: String, calendar: Calendar = .current) -> Int? {
    guard let day = day(key, calendar: calendar) else { return nil }
    return calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: day).day
  }

  // "Today", "Tomorrow", then "Mon, Jul 7".
  static func label(_ key: String, now: Date, calendar: Calendar = .current) -> String {
    switch daysFrom(now, to: key, calendar: calendar) {
    case 0: return "Today"
    case 1: return "Tomorrow"
    default:
      guard let day = day(key, calendar: calendar) else { return key }
      return day.formatted(.dateTime.weekday(.abbreviated).month(.abbreviated).day())
    }
  }

  // A day's releases stay listed through the end of that day.
  static func upcoming(
    _ items: [ReleasingSoonItem],
    now: Date,
    calendar: Calendar = .current
  ) -> [ReleasingSoonItem] {
    items.filter { (daysFrom(now, to: $0.dateKey, calendar: calendar) ?? -1) >= 0 }
  }
}

extension ReleasingSoonSnapshot {
  // Widget gallery preview and placeholder: sample rows, never real data.
  static var preview: ReleasingSoonSnapshot {
    let today = Date()
    func key(_ offset: Int) -> String {
      let day = Calendar.current.date(byAdding: .day, value: offset, to: today) ?? today
      let c = Calendar.current.dateComponents([.year, .month, .day], from: day)
      return String(format: "%04d-%02d-%02d", c.year ?? 2026, c.month ?? 1, c.day ?? 1)
    }
    func item(_ id: String, _ kind: String, _ title: String, _ subtitle: String, _ offset: Int)
      -> ReleasingSoonItem
    {
      ReleasingSoonItem(
        id: id, kind: kind, title: title, subtitle: subtitle, dateKey: key(offset),
        posterUrl: nil, barColor: kind == "movie" ? "#f59e0b" : "#3b82f6", hasFile: false,
        route: "/calendar")
    }
    return ReleasingSoonSnapshot(
      v: 1, state: "ok", generatedAt: today.timeIntervalSince1970 * 1000,
      scheme: "dashboarr", daysAhead: 7,
      items: [
        item("p1", "episode", "Severance", "S02E04 · Woe's Hollow", 0),
        item("p2", "movie", "Dune: Part Three", "2026 · Movie", 1),
        item("p3", "episode", "The Last of Us", "S02E03 · The Path", 3),
        item("p4", "episode", "Andor", "S02E07 · Messenger", 5),
      ])
  }
}
