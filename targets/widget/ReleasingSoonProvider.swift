import Foundation
import ImageIO
import WidgetKit

struct ReleasingSoonEntry: TimelineEntry {
  let date: Date
  // nil until the app has published once.
  let snapshot: ReleasingSoonSnapshot?
  // Downsampled posters by item id.
  let posters: [String: CGImage]
}

struct ReleasingSoonProvider: TimelineProvider {
  func placeholder(in context: Context) -> ReleasingSoonEntry {
    ReleasingSoonEntry(date: Date(), snapshot: .preview, posters: [:])
  }

  func getSnapshot(in context: Context, completion: @escaping (ReleasingSoonEntry) -> Void) {
    let stored = ReleasingSoonStore.load()
    let snapshot = context.isPreview && stored == nil ? .preview : stored
    completion(ReleasingSoonEntry(date: Date(), snapshot: snapshot, posters: [:]))
  }

  // The app is the only writer: it refreshes the snapshot and reloads this
  // timeline whenever it fetches the calendar. In between, one entry per coming
  // midnight rolls the day labels over and drops past releases on schedule.
  func getTimeline(in context: Context, completion: @escaping (Timeline<ReleasingSoonEntry>) -> Void) {
    let snapshot = ReleasingSoonStore.load()
    let now = Date()
    let posterCount = ReleasingSoonLayout.rows(for: context.family)
    Task {
      var posters: [String: CGImage] = [:]
      if let snapshot, posterCount > 0 {
        let upcoming = ReleasingSoonDates.upcoming(snapshot.items, now: now)
        posters = await PosterLoader.load(Array(upcoming.prefix(posterCount + 2)))
      }
      let calendar = Calendar.current
      var dates = [now]
      var midnight = calendar.startOfDay(for: now)
      for _ in 0...(snapshot?.daysAhead ?? 7) {
        guard let next = calendar.date(byAdding: .day, value: 1, to: midnight) else { break }
        dates.append(next)
        midnight = next
      }
      let entries = dates.map {
        ReleasingSoonEntry(date: $0, snapshot: snapshot, posters: posters)
      }
      completion(Timeline(entries: entries, policy: .atEnd))
    }
  }
}

// Poster thumbnails for the list rows. The URLs are public artwork (TMDB/TVDB),
// so this session sends no credentials and keeps no cookies or cache. A failure
// just leaves the placeholder.
enum PosterLoader {
  private static let session: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.timeoutIntervalForRequest = 8
    config.timeoutIntervalForResource = 15
    config.httpCookieStorage = nil
    config.urlCache = nil
    return URLSession(configuration: config)
  }()

  static func load(_ items: [ReleasingSoonItem]) async -> [String: CGImage] {
    await withTaskGroup(of: (String, CGImage?).self) { group in
      for item in items {
        guard let url = thumbnailURL(item.posterUrl) else { continue }
        group.addTask { (item.id, await fetch(url)) }
      }
      var posters: [String: CGImage] = [:]
      for await (id, image) in group {
        if let image { posters[id] = image }
      }
      return posters
    }
  }

  // HTTPS only. TMDB serves w500 in the agenda; the rows need far less.
  static func thumbnailURL(_ raw: String?) -> URL? {
    guard let raw else { return nil }
    let small = raw.replacingOccurrences(of: "/t/p/w500/", with: "/t/p/w154/")
    guard let url = URL(string: small), url.scheme == "https" else { return nil }
    return url
  }

  private static func fetch(_ url: URL) async -> CGImage? {
    guard
      let (data, response) = try? await session.data(from: url),
      (response as? HTTPURLResponse)?.statusCode == 200
    else { return nil }
    return downsample(data, maxPixelSize: 160)
  }

  // Widget extensions run under a tight memory limit, so decode straight to a
  // small thumbnail instead of the full image.
  static func downsample(_ data: Data, maxPixelSize: Int) -> CGImage? {
    guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
    let options: [CFString: Any] = [
      kCGImageSourceCreateThumbnailFromImageAlways: true,
      kCGImageSourceCreateThumbnailWithTransform: true,
      kCGImageSourceShouldCacheImmediately: true,
      kCGImageSourceThumbnailMaxPixelSize: maxPixelSize,
    ]
    return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
  }
}
