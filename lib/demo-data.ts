import type { ServiceId } from "@/lib/constants";

function daysFromNow(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split("T")[0]!;
}

function daysFromNowFull(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

const NOW_TS = Math.floor(Date.now() / 1000);

// --- qBittorrent ---

const DEMO_QB_TRANSFER_INFO = {
  dl_info_speed: 5242880,
  dl_info_data: 107374182400,
  up_info_speed: 1048576,
  up_info_data: 21474836480,
  dl_rate_limit: 0,
  up_rate_limit: 0,
  dht_nodes: 156,
  connection_status: "connected",
};

const DEMO_QB_TORRENTS = [
  {
    hash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    name: "The.Dark.Knight.2008.2160p.UHD.BluRay.x265-TERMINAL",
    size: 48318382080,
    progress: 0.63,
    dlspeed: 4194304,
    upspeed: 524288,
    priority: 1,
    num_seeds: 42,
    num_leechs: 7,
    ratio: 0.18,
    eta: 10800,
    state: "downloading",
    category: "movies",
    tags: "",
    added_on: NOW_TS - 7200,
    completion_on: -1,
    save_path: "/downloads/movies/",
    content_path: "/downloads/movies/The.Dark.Knight.2008.2160p.UHD.BluRay.x265-TERMINAL",
    amount_left: 17877286912,
    completed: 30441095168,
    downloaded: 30441095168,
    uploaded: 5476352000,
  },
  {
    hash: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    name: "Fallout.S01E01-E08.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb",
    size: 22548578304,
    progress: 0.41,
    dlspeed: 1048576,
    upspeed: 204800,
    priority: 2,
    num_seeds: 18,
    num_leechs: 3,
    ratio: 0.09,
    eta: 20160,
    state: "downloading",
    category: "tv",
    tags: "",
    added_on: NOW_TS - 3600,
    completion_on: -1,
    save_path: "/downloads/tv/",
    content_path: "/downloads/tv/Fallout.S01E01-E08",
    amount_left: 13303661568,
    completed: 9244916736,
    downloaded: 9244916736,
    uploaded: 832716800,
  },
  {
    hash: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    name: "Dune.Part.Two.2024.1080p.BluRay.x264-SPARKS",
    size: 14495514624,
    progress: 1.0,
    dlspeed: 0,
    upspeed: 786432,
    priority: 0,
    num_seeds: 96,
    num_leechs: 22,
    ratio: 2.14,
    eta: 8640000,
    state: "uploading",
    category: "movies",
    tags: "",
    added_on: NOW_TS - 86400,
    completion_on: NOW_TS - 72000,
    save_path: "/downloads/movies/",
    content_path: "/downloads/movies/Dune.Part.Two.2024.1080p.BluRay.x264-SPARKS",
    amount_left: 0,
    completed: 14495514624,
    downloaded: 14495514624,
    uploaded: 31020401664,
  },
  {
    hash: "d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5",
    name: "House.of.the.Dragon.S02E08.1080p.MAX.WEB-DL.DDP5.1.H.264-FLUX",
    size: 4831838208,
    progress: 1.0,
    dlspeed: 0,
    upspeed: 0,
    priority: 0,
    num_seeds: 0,
    num_leechs: 0,
    ratio: 0.87,
    eta: 8640000,
    state: "pausedUP",
    category: "tv",
    tags: "",
    added_on: NOW_TS - 172800,
    completion_on: NOW_TS - 169200,
    save_path: "/downloads/tv/",
    content_path: "/downloads/tv/House.of.the.Dragon.S02E08",
    amount_left: 0,
    completed: 4831838208,
    downloaded: 4831838208,
    uploaded: 4203599488,
  },
];

// --- Radarr ---

function makeMovie(id: number, title: string, year: number, tmdbId: number, hasFile: boolean) {
  return {
    id,
    title,
    sortTitle: title.toLowerCase(),
    year,
    tmdbId,
    imdbId: `tt${String(tmdbId).padStart(7, "0")}`,
    overview: `An acclaimed ${year} film praised for its storytelling and performances.`,
    monitored: true,
    hasFile,
    isAvailable: hasFile,
    status: hasFile ? "released" : "announced",
    added: daysFromNowFull(-30),
    sizeOnDisk: hasFile ? 14495514624 : 0,
    images: [],
    ratings: { votes: 3200, value: 7.8 },
    runtime: 138,
    qualityProfileId: 1,
    rootFolderPath: "/movies",
    ...(hasFile
      ? {
          movieFile: {
            id: id * 10,
            movieId: id,
            relativePath: `${title.replace(/[\s:]/g, ".")}.${year}.1080p.BluRay.mkv`,
            size: 14495514624,
            quality: { quality: { name: "Bluray-1080p" } },
          },
        }
      : {}),
  };
}

const DEMO_RADARR_MOVIES = [
  makeMovie(1, "Dune: Part Two", 2024, 693134, true),
  makeMovie(2, "Oppenheimer", 2023, 872585, true),
  makeMovie(3, "Interstellar", 2014, 157336, true),
  makeMovie(4, "The Batman", 2022, 414906, true),
  makeMovie(5, "Inception", 2010, 27205, true),
  makeMovie(6, "Everything Everywhere All at Once", 2022, 545611, true),
  makeMovie(7, "Deadpool & Wolverine", 2024, 779782, false),
  makeMovie(8, "Kingdom of the Planet of the Apes", 2024, 653346, false),
];

const DEMO_RADARR_QUEUE = {
  page: 1,
  pageSize: 20,
  totalRecords: 2,
  records: [
    {
      id: 101,
      movieId: 7,
      title: "Deadpool.Wolverine.2024.1080p.BluRay.x264-GROUP",
      status: "downloading",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "downloading",
      statusMessages: [],
      size: 14495514624,
      sizeleft: 8674508390,
      timeleft: "01:45:00",
      estimatedCompletionTime: daysFromNowFull(0.07),
      protocol: "torrent",
      downloadClient: "qBittorrent",
      quality: { quality: { name: "Bluray-1080p" } },
      movie: makeMovie(7, "Deadpool & Wolverine", 2024, 779782, false),
    },
    {
      id: 102,
      movieId: 8,
      title: "Kingdom.of.the.Planet.of.the.Apes.2024.1080p.WEB-DL-GROUP",
      status: "queued",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "queued",
      statusMessages: [],
      size: 9663676416,
      sizeleft: 9663676416,
      timeleft: null,
      protocol: "torrent",
      downloadClient: "qBittorrent",
      quality: { quality: { name: "WEBDL-1080p" } },
      movie: makeMovie(8, "Kingdom of the Planet of the Apes", 2024, 653346, false),
    },
  ],
};

const DEMO_RADARR_WANTED = {
  page: 1,
  pageSize: 20,
  totalRecords: 2,
  records: [
    makeMovie(7, "Deadpool & Wolverine", 2024, 779782, false),
    makeMovie(8, "Kingdom of the Planet of the Apes", 2024, 653346, false),
  ],
};

const DEMO_RADARR_CALENDAR = [
  { ...makeMovie(9, "Alien: Romulus", 2024, 945961, false), digitalRelease: daysFromNow(3) },
  { ...makeMovie(10, "Twisters", 2024, 1019237, false), inCinemas: daysFromNow(-7), digitalRelease: daysFromNow(5) },
];

// --- Sonarr ---

function makeSeries(id: number, title: string, year: number, tvdbId: number) {
  return {
    id,
    title,
    sortTitle: title.toLowerCase(),
    seasonCount: 2,
    totalEpisodeCount: 16,
    episodeCount: 14,
    episodeFileCount: 14,
    sizeOnDisk: 28991029248,
    status: "continuing",
    overview: `An acclaimed series praised for its writing and performances.`,
    network: "HBO",
    year,
    tvdbId,
    monitored: true,
    added: daysFromNowFull(-60),
    images: [],
    seasons: [
      { seasonNumber: 1, monitored: true, statistics: { episodeFileCount: 8, episodeCount: 8, totalEpisodeCount: 8, sizeOnDisk: 14495514624, percentOfEpisodes: 100 } },
      { seasonNumber: 2, monitored: true, statistics: { episodeFileCount: 6, episodeCount: 6, totalEpisodeCount: 8, sizeOnDisk: 14495514624, percentOfEpisodes: 75 } },
    ],
    qualityProfileId: 1,
    rootFolderPath: "/tv",
    statistics: { seasonCount: 2, episodeFileCount: 14, episodeCount: 14, totalEpisodeCount: 16, sizeOnDisk: 28991029248, percentOfEpisodes: 87.5 },
  };
}

const DEMO_SONARR_SERIES = [
  makeSeries(1, "House of the Dragon", 2022, 362696),
  makeSeries(2, "The Last of Us", 2023, 392367),
  makeSeries(3, "Fallout", 2024, 456789),
  makeSeries(4, "Shogun", 2024, 345678),
  makeSeries(5, "Severance", 2022, 403891),
];

const DEMO_SONARR_CALENDAR = [
  {
    id: 201,
    seriesId: 1,
    episodeNumber: 3,
    seasonNumber: 2,
    title: "The Burning Mill",
    airDate: daysFromNow(1),
    airDateUtc: daysFromNowFull(1),
    hasFile: false,
    monitored: true,
    series: makeSeries(1, "House of the Dragon", 2022, 362696),
  },
  {
    id: 202,
    seriesId: 2,
    episodeNumber: 5,
    seasonNumber: 2,
    title: "When Winter Falls",
    airDate: daysFromNow(2),
    airDateUtc: daysFromNowFull(2),
    hasFile: false,
    monitored: true,
    series: makeSeries(2, "The Last of Us", 2023, 392367),
  },
  {
    id: 203,
    seriesId: 3,
    episodeNumber: 6,
    seasonNumber: 1,
    title: "The Radio",
    airDate: daysFromNow(3),
    airDateUtc: daysFromNowFull(3),
    hasFile: false,
    monitored: true,
    series: makeSeries(3, "Fallout", 2024, 456789),
  },
  {
    id: 204,
    seriesId: 5,
    episodeNumber: 2,
    seasonNumber: 2,
    title: "Goodbye, Mrs. Selvig",
    airDate: daysFromNow(5),
    airDateUtc: daysFromNowFull(5),
    hasFile: false,
    monitored: true,
    series: makeSeries(5, "Severance", 2022, 403891),
  },
];

const DEMO_SONARR_QUEUE = {
  page: 1,
  pageSize: 20,
  totalRecords: 1,
  records: [
    {
      id: 301,
      seriesId: 3,
      episodeId: 203,
      title: "Fallout.S01E06.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb",
      status: "downloading",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "downloading",
      size: 2684354560,
      sizeleft: 1610612736,
      timeleft: "00:35:00",
      estimatedCompletionTime: daysFromNowFull(0.03),
      protocol: "torrent",
      quality: { quality: { name: "WEBDL-1080p" } },
      series: makeSeries(3, "Fallout", 2024, 456789),
    },
  ],
};

// --- Overseerr ---

const DEMO_OVERSEERR_REQUESTS = {
  pageInfo: { pages: 1, pageSize: 10, results: 3, page: 1 },
  results: [
    {
      id: 1,
      status: 1,
      media: { id: 101, mediaType: "movie", tmdbId: 779782, status: 3, createdAt: daysFromNowFull(-2), updatedAt: daysFromNowFull(-1) },
      createdAt: daysFromNowFull(-2),
      updatedAt: daysFromNowFull(-1),
      requestedBy: { id: 1, displayName: "John Smith" },
    },
    {
      id: 2,
      status: 1,
      media: { id: 102, mediaType: "tv", tmdbId: 456789, status: 2, createdAt: daysFromNowFull(-3), updatedAt: daysFromNowFull(-3) },
      createdAt: daysFromNowFull(-3),
      updatedAt: daysFromNowFull(-3),
      requestedBy: { id: 2, displayName: "Sarah Connor" },
    },
    {
      id: 3,
      status: 2,
      media: { id: 103, mediaType: "movie", tmdbId: 545611, status: 5, createdAt: daysFromNowFull(-7), updatedAt: daysFromNowFull(-5) },
      createdAt: daysFromNowFull(-7),
      updatedAt: daysFromNowFull(-5),
      requestedBy: { id: 3, displayName: "Alex Johnson" },
      modifiedBy: { id: 1, displayName: "Admin" },
    },
  ],
};

const DEMO_OVERSEERR_REQUEST_COUNT = {
  total: 3,
  movie: 2,
  tv: 1,
  pending: 2,
  approved: 1,
  declined: 0,
  processing: 1,
  available: 1,
};

const DEMO_OVERSEERR_SEARCH = {
  page: 1,
  totalPages: 2,
  totalResults: 12,
  results: [
    { id: 779782, mediaType: "movie", title: "Deadpool & Wolverine", overview: "Deadpool is recruited by the TVA.", posterPath: "/8cdWjvZQUExUUTzyp4t6EDMubfO.jpg", releaseDate: "2024-07-26", voteAverage: 7.8, mediaInfo: { status: 3 } },
    { id: 693134, mediaType: "movie", title: "Dune: Part Two", overview: "Paul Atreides unites with the Fremen.", posterPath: "/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg", releaseDate: "2024-03-01", voteAverage: 8.2, mediaInfo: { status: 5 } },
    { id: 872585, mediaType: "movie", title: "Oppenheimer", overview: "The story of J. Robert Oppenheimer.", posterPath: "/8Gxv8gSFCU0XGDykEGv7zR1n2ua.jpg", releaseDate: "2023-07-21", voteAverage: 8.1, mediaInfo: { status: 5 } },
    { id: 762441, mediaType: "movie", title: "A Quiet Place: Day One", overview: "New York City faces the apocalypse.", posterPath: "/yrpP9gPaPsYJXMmBhDcChCMIXkv.jpg", releaseDate: "2024-06-28", voteAverage: 7.0 },
    { id: 114472, mediaType: "tv", name: "Fallout", overview: "Survivors compete in a post-apocalyptic future.", posterPath: "/AnsSKR4UlA3n4Xd2Kp95SKfNtV6.jpg", firstAirDate: "2024-04-11", voteAverage: 8.5, mediaInfo: { status: 5 } },
    { id: 87108, mediaType: "tv", name: "Chernobyl", overview: "The true story of the nuclear catastrophe.", posterPath: "/hlLXt2tOPT6RRnjiUmoxyG1LTFi.jpg", firstAirDate: "2019-05-06", voteAverage: 9.3 },
  ],
};

// --- Tautulli ---

const DEMO_TAUTULLI_ACTIVITY = {
  stream_count: "2",
  stream_count_direct_play: 1,
  stream_count_direct_stream: 0,
  stream_count_transcode: 1,
  total_bandwidth: 14680064,
  wan_bandwidth: 8388608,
  lan_bandwidth: 6291456,
  sessions: [
    {
      session_key: "abc123",
      session_id: "sess1",
      media_type: "movie",
      title: "Dune: Part Two",
      parent_title: "",
      grandparent_title: "",
      full_title: "Dune: Part Two",
      year: "2024",
      thumb: "",
      parent_thumb: "",
      grandparent_thumb: "",
      state: "playing",
      progress_percent: "47",
      transcode_decision: "direct play",
      video_resolution: "1080",
      stream_video_resolution: "1080",
      bandwidth: "8000",
      quality_profile: "Original",
      user: "john_smith",
      player: "Apple TV 4K",
      platform: "tvOS",
      product: "Plex for Apple TV",
      duration: "9960000",
      view_offset: "4681200",
      ip_address: "192.168.1.45",
    },
    {
      session_key: "def456",
      session_id: "sess2",
      media_type: "episode",
      title: "The Big Door Prize",
      parent_title: "Season 1",
      grandparent_title: "Fallout",
      full_title: "Fallout - The Big Door Prize",
      year: "2024",
      thumb: "",
      parent_thumb: "",
      grandparent_thumb: "",
      state: "playing",
      progress_percent: "23",
      transcode_decision: "transcode",
      video_resolution: "1080",
      stream_video_resolution: "720",
      bandwidth: "6000",
      quality_profile: "4 Mbps 720p",
      user: "sarah_c",
      player: "Chrome",
      platform: "Chrome",
      product: "Plex Web",
      duration: "3720000",
      view_offset: "855600",
      ip_address: "74.125.100.1",
    },
  ],
};

const DEMO_TAUTULLI_HISTORY = {
  draw: 1,
  recordsTotal: 50,
  recordsFiltered: 50,
  data: [
    { reference_id: 1, row_id: 1, id: 1001, date: NOW_TS - 3600, started: NOW_TS - 7200, stopped: NOW_TS - 3600, duration: 3600, paused_counter: 0, user: "john_smith", friendly_name: "John Smith", platform: "tvOS", player: "Apple TV 4K", full_title: "Oppenheimer", title: "Oppenheimer", parent_title: "", grandparent_title: "", year: 2023, media_type: "movie", thumb: "", percent_complete: 100, watched_status: 1 },
    { reference_id: 2, row_id: 2, id: 1002, date: NOW_TS - 86400, started: NOW_TS - 90000, stopped: NOW_TS - 86400, duration: 3600, paused_counter: 120, user: "sarah_c", friendly_name: "Sarah Connor", platform: "Chrome", player: "Plex Web", full_title: "Fallout - The Big Door Prize", title: "The Big Door Prize", parent_title: "Season 1", grandparent_title: "Fallout", year: 2024, media_type: "episode", thumb: "", percent_complete: 85, watched_status: 0 },
    { reference_id: 3, row_id: 3, id: 1003, date: NOW_TS - 172800, started: NOW_TS - 179200, stopped: NOW_TS - 172800, duration: 6400, paused_counter: 0, user: "john_smith", friendly_name: "John Smith", platform: "tvOS", player: "Apple TV 4K", full_title: "Dune: Part Two", title: "Dune: Part Two", parent_title: "", grandparent_title: "", year: 2024, media_type: "movie", thumb: "", percent_complete: 100, watched_status: 1 },
  ],
};

const DEMO_TAUTULLI_LIBRARIES = {
  data: [
    { section_id: 1, section_name: "Movies", section_type: "movie", count: "847" },
    { section_id: 2, section_name: "TV Shows", section_type: "show", count: "142", parent_count: "621", child_count: "11847" },
    { section_id: 3, section_name: "Music", section_type: "artist", count: "38", parent_count: "214", child_count: "3891" },
  ],
};

const DEMO_TAUTULLI_SERVER_IDENTITY = {
  machine_identifier: "a1b2c3d4e5f6a7b8c9d0",
  version: "2.13.4",
};

// --- Prowlarr ---

const DEMO_PROWLARR_INDEXERS = [
  { id: 1, name: "RARBG", protocol: "torrent", enable: true, priority: 25, added: daysFromNowFull(-90), fields: [], tags: [], appProfileId: 1 },
  { id: 2, name: "1337x", protocol: "torrent", enable: true, priority: 25, added: daysFromNowFull(-90), fields: [], tags: [], appProfileId: 1 },
  { id: 3, name: "NZBgeek", protocol: "usenet", enable: true, priority: 25, added: daysFromNowFull(-60), fields: [], tags: [], appProfileId: 1 },
  { id: 4, name: "The Pirate Bay", protocol: "torrent", enable: false, priority: 50, added: daysFromNowFull(-120), fields: [], tags: [], appProfileId: 1 },
  { id: 5, name: "NZBHydra2", protocol: "usenet", enable: true, priority: 25, added: daysFromNowFull(-45), fields: [], tags: [], appProfileId: 1 },
  { id: 6, name: "EZTV", protocol: "torrent", enable: true, priority: 25, added: daysFromNowFull(-75), fields: [], tags: [], appProfileId: 1 },
];

const DEMO_PROWLARR_INDEXER_STATUSES = [
  { indexerId: 4, disabledTill: daysFromNowFull(2), mostRecentFailure: daysFromNowFull(-1), initialFailure: daysFromNowFull(-3) },
];

const DEMO_PROWLARR_STATS = {
  indexers: [
    { indexerId: 1, indexerName: "RARBG", averageResponseTime: 312, numberOfQueries: 847, numberOfGrabs: 124, numberOfFailures: 3 },
    { indexerId: 2, indexerName: "1337x", averageResponseTime: 445, numberOfQueries: 623, numberOfGrabs: 89, numberOfFailures: 7 },
    { indexerId: 3, indexerName: "NZBgeek", averageResponseTime: 287, numberOfQueries: 412, numberOfGrabs: 56, numberOfFailures: 1 },
    { indexerId: 5, indexerName: "NZBHydra2", averageResponseTime: 198, numberOfQueries: 291, numberOfGrabs: 42, numberOfFailures: 0 },
    { indexerId: 6, indexerName: "EZTV", averageResponseTime: 521, numberOfQueries: 189, numberOfGrabs: 23, numberOfFailures: 12 },
  ],
};

const DEMO_PROWLARR_SEARCH_RESULTS = [
  { guid: "prowlarr-1-tt123456", indexerId: 1, indexer: "RARBG", title: "Demo.Movie.2024.1080p.BluRay.x264-GROUP", size: 9663676416, publishDate: daysFromNowFull(-2), categories: [{ id: 2000, name: "Movies" }], seeders: 482, leechers: 23, protocol: "torrent", age: 2, ageMinutes: 2880 },
  { guid: "prowlarr-2-tt789012", indexerId: 2, indexer: "1337x", title: "Demo.Movie.2024.2160p.UHD.BluRay.HDR.x265-GROUP", size: 48318382080, publishDate: daysFromNowFull(-3), categories: [{ id: 2000, name: "Movies" }], seeders: 127, leechers: 8, protocol: "torrent", age: 3, ageMinutes: 4320 },
];

// --- Plex ---

const DEMO_PLEX_LIBRARIES = {
  MediaContainer: {
    Directory: [
      { key: "1", title: "Movies", type: "movie", scanner: "Plex Movie", count: 847 },
      { key: "2", title: "TV Shows", type: "show", scanner: "Plex TV Series", count: 142 },
      { key: "3", title: "Music", type: "artist", scanner: "Plex Music", count: 38 },
    ],
  },
};

const DEMO_PLEX_SESSIONS = {
  MediaContainer: {
    size: 1,
    Metadata: [
      {
        sessionKey: "abc123",
        ratingKey: "12345",
        type: "movie",
        title: "Dune: Part Two",
        year: 2024,
        thumb: "",
        duration: 9960000,
        viewOffset: 4681200,
        Player: { title: "Apple TV 4K", platform: "tvOS", state: "playing", local: true, address: "192.168.1.45" },
        Session: { id: "sess1", bandwidth: 8000, location: "lan" },
        User: { id: 1, title: "john_smith" },
      },
    ],
  },
};

const DEMO_PLEX_MEDIA_CONTAINER = {
  MediaContainer: {
    size: 4,
    Metadata: [
      { ratingKey: "12345", key: "/library/metadata/12345", type: "movie", title: "Dune: Part Two", year: 2024, thumb: "", duration: 9960000, addedAt: NOW_TS - 86400, viewCount: 2 },
      { ratingKey: "12346", key: "/library/metadata/12346", type: "movie", title: "Oppenheimer", year: 2023, thumb: "", duration: 11040000, addedAt: NOW_TS - 172800, viewCount: 1 },
      { ratingKey: "12347", key: "/library/metadata/12347", type: "episode", title: "The Big Door Prize", parentTitle: "Season 1", grandparentTitle: "Fallout", thumb: "", duration: 3720000, addedAt: NOW_TS - 3600 },
      { ratingKey: "12348", key: "/library/metadata/12348", type: "episode", title: "The End", parentTitle: "Season 1", grandparentTitle: "Fallout", thumb: "", duration: 4200000, addedAt: NOW_TS - 7200 },
    ],
  },
};

// --- Glances ---

const DEMO_GLANCES_CPU = { total: 43.2, user: 29.8, system: 11.4, idle: 56.8, iowait: 1.8, cpucore: 8 };
const DEMO_GLANCES_MEM = { total: 17179869184, used: 10871635968, free: 6308233216, available: 8053063680, percent: 63.3, cached: 3758096384, buffers: 1073741824 };
const DEMO_GLANCES_FS = [
  { device_name: "/dev/sda1", mnt_point: "/", fs_type: "ext4", size: 2000398934016, used: 1236398080000, free: 764000854016, percent: 61.8 },
  { device_name: "/dev/sdb1", mnt_point: "/media", fs_type: "ext4", size: 4000787030016, used: 3216512491520, free: 784274538496, percent: 80.4 },
];
const DEMO_GLANCES_PERCPU = [
  { cpu_number: 0, total: 52.1, user: 38.2, system: 13.1, idle: 47.9 },
  { cpu_number: 1, total: 34.7, user: 22.3, system: 10.8, idle: 65.3 },
  { cpu_number: 2, total: 61.4, user: 45.2, system: 14.7, idle: 38.6 },
  { cpu_number: 3, total: 28.9, user: 18.6, system: 9.1, idle: 71.1 },
];
const DEMO_GLANCES_LOAD = { min1: 3.42, min5: 2.87, min15: 2.61, cpucore: 8 };
const DEMO_GLANCES_DISKIO = [
  { disk_name: "sda", read_bytes: 4096000, write_bytes: 1048576, read_count: 128, write_count: 32, time_since_update: 1 },
  { disk_name: "sdb", read_bytes: 20971520, write_bytes: 8388608, read_count: 512, write_count: 256, time_since_update: 1 },
];

// --- Bazarr ---

const DEMO_BAZARR_WANTED_MOVIES = {
  data: [
    { radarrId: 7, title: "Deadpool & Wolverine", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }], year: "2024" },
    { radarrId: 8, title: "Kingdom of the Planet of the Apes", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }, { name: "Spanish", code2: "es", code3: "spa", hi: false, forced: false }], year: "2024" },
    { radarrId: 3, title: "Interstellar", missing_subtitles: [{ name: "French", code2: "fr", code3: "fra", hi: false, forced: false }], year: "2014" },
  ],
  total: 3,
};

const DEMO_BAZARR_WANTED_EPISODES = {
  data: [
    { sonarrSeriesId: 1, sonarrEpisodeId: 201, seriesTitle: "House of the Dragon", episodeTitle: "The Burning Mill", episode_number: "2x03", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }] },
    { sonarrSeriesId: 2, sonarrEpisodeId: 202, seriesTitle: "The Last of Us", episodeTitle: "When Winter Falls", episode_number: "2x05", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }, { name: "Spanish", code2: "es", code3: "spa", hi: false, forced: false }] },
    { sonarrSeriesId: 3, sonarrEpisodeId: 203, seriesTitle: "Fallout", episodeTitle: "The Radio", episode_number: "1x06", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }] },
    { sonarrSeriesId: 5, sonarrEpisodeId: 204, seriesTitle: "Severance", episodeTitle: "Goodbye, Mrs. Selvig", episode_number: "2x02", missing_subtitles: [{ name: "English", code2: "en", code3: "eng", hi: false, forced: false }] },
  ],
  total: 4,
};

const DEMO_BAZARR_HISTORY = {
  data: [
    { id: 1, action: 1, timestamp: daysFromNowFull(-1), description: "Downloaded English subtitle", language: { name: "English", code2: "en" }, provider: "OpenSubtitles", score: "95", title: "Dune: Part Two" },
    { id: 2, action: 1, timestamp: daysFromNowFull(-2), description: "Downloaded English subtitle", language: { name: "English", code2: "en" }, provider: "Subscene", score: "88", seriesTitle: "Fallout", episodeTitle: "The End" },
  ],
  total: 2,
};

const DEMO_BAZARR_PROVIDERS = [
  { name: "OpenSubtitles", status: "ok" },
  { name: "Subscene", status: "ok" },
  { name: "Addic7ed", status: "throttled", retry: daysFromNowFull(1) },
];

const DEMO_SYSTEM_STATUS = { version: "5.14.0.9376", isDebug: false, isProduction: true };

// --- Lookup functions ---

export function getDemoResponse(serviceId: ServiceId, path: string): unknown {
  const basePath = path.split("?")[0]!;
  const normalized = basePath.replace(/\/\d+(\.\d+)*$/, "/:id");

  switch (serviceId) {
    case "radarr": {
      if (normalized === "/movie") return DEMO_RADARR_MOVIES;
      if (normalized === "/movie/:id") return DEMO_RADARR_MOVIES[0];
      if (normalized.startsWith("/queue")) return DEMO_RADARR_QUEUE;
      if (normalized.startsWith("/wanted/missing")) return DEMO_RADARR_WANTED;
      if (normalized.startsWith("/calendar")) return DEMO_RADARR_CALENDAR;
      if (normalized.startsWith("/qualityprofile")) return [{ id: 1, name: "HD-1080p" }, { id: 2, name: "Ultra-HD" }];
      if (normalized.startsWith("/rootfolder")) return [{ id: 1, path: "/movies", freeSpace: 2199023255552 }];
      if (normalized.startsWith("/tag")) return [];
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      if (normalized.startsWith("/movie/lookup")) return [];
      return undefined;
    }
    case "sonarr": {
      if (normalized === "/series") return DEMO_SONARR_SERIES;
      if (normalized === "/series/:id") return DEMO_SONARR_SERIES[0];
      if (normalized.startsWith("/calendar")) return DEMO_SONARR_CALENDAR;
      if (normalized.startsWith("/queue")) return DEMO_SONARR_QUEUE;
      if (normalized.startsWith("/qualityprofile")) return [{ id: 1, name: "Any" }, { id: 2, name: "HD-1080p" }];
      if (normalized.startsWith("/rootfolder")) return [{ id: 1, path: "/tv", freeSpace: 2199023255552 }];
      if (normalized.startsWith("/tag")) return [];
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      if (normalized.startsWith("/series/lookup")) return [];
      if (normalized.startsWith("/episode")) return [];
      return undefined;
    }
    case "overseerr": {
      if (normalized.startsWith("/request/count")) return DEMO_OVERSEERR_REQUEST_COUNT;
      if (normalized.startsWith("/request")) return DEMO_OVERSEERR_REQUESTS;
      if (normalized.startsWith("/search")) return DEMO_OVERSEERR_SEARCH;
      if (normalized.startsWith("/discover")) return DEMO_OVERSEERR_SEARCH;
      if (normalized.startsWith("/movie/")) return { id: 779782, title: "Deadpool & Wolverine", posterPath: "", releaseDate: "2024-07-26" };
      if (normalized.startsWith("/tv/")) return { id: 114472, name: "Fallout", posterPath: "", firstAirDate: "2024-04-11" };
      if (normalized.startsWith("/status")) return { version: "2.2.0", commitTag: "HEAD" };
      return undefined;
    }
    case "prowlarr": {
      if (normalized === "/indexer") return DEMO_PROWLARR_INDEXERS;
      if (normalized.startsWith("/indexerstatus")) return DEMO_PROWLARR_INDEXER_STATUSES;
      if (normalized.startsWith("/indexerstats")) return DEMO_PROWLARR_STATS;
      if (normalized.startsWith("/search")) return DEMO_PROWLARR_SEARCH_RESULTS;
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      return undefined;
    }
    case "bazarr": {
      if (normalized.startsWith("/movies/wanted")) return DEMO_BAZARR_WANTED_MOVIES;
      if (normalized.startsWith("/episodes/wanted")) return DEMO_BAZARR_WANTED_EPISODES;
      if (normalized.startsWith("/history/movies")) return DEMO_BAZARR_HISTORY;
      if (normalized.startsWith("/history/series")) return DEMO_BAZARR_HISTORY;
      if (normalized.startsWith("/providers")) return DEMO_BAZARR_PROVIDERS;
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      return undefined;
    }
    case "glances": {
      if (normalized === "/cpu") return DEMO_GLANCES_CPU;
      if (normalized === "/mem") return DEMO_GLANCES_MEM;
      if (normalized === "/fs") return DEMO_GLANCES_FS;
      if (normalized === "/percpu") return DEMO_GLANCES_PERCPU;
      if (normalized === "/load") return DEMO_GLANCES_LOAD;
      if (normalized === "/diskio") return DEMO_GLANCES_DISKIO;
      return undefined;
    }
    case "qbittorrent": {
      if (normalized === "/transfer/info") return DEMO_QB_TRANSFER_INFO;
      if (normalized.startsWith("/torrents/info")) return DEMO_QB_TORRENTS;
      if (normalized.startsWith("/torrents/files")) return [];
      if (normalized.startsWith("/torrents/trackers")) return [];
      if (normalized.startsWith("/app/version")) return "5.0.0";
      return undefined;
    }
    default:
      return undefined;
  }
}

export function getDemoTautulliResponse(cmd: string): unknown {
  switch (cmd) {
    case "get_activity": return DEMO_TAUTULLI_ACTIVITY;
    case "get_history": return DEMO_TAUTULLI_HISTORY;
    case "get_libraries_table": return DEMO_TAUTULLI_LIBRARIES;
    case "get_server_identity": return DEMO_TAUTULLI_SERVER_IDENTITY;
    default: return undefined;
  }
}

export function getDemoPlexResponse(path: string): unknown {
  const basePath = path.split("?")[0]!;
  if (basePath === "/library/sections") return DEMO_PLEX_LIBRARIES;
  if (basePath === "/status/sessions") return DEMO_PLEX_SESSIONS;
  if (basePath === "/library/recentlyAdded") return DEMO_PLEX_MEDIA_CONTAINER;
  if (basePath === "/library/onDeck") return DEMO_PLEX_MEDIA_CONTAINER;
  if (basePath.includes("/recentlyAdded")) return DEMO_PLEX_MEDIA_CONTAINER;
  if (basePath.includes("/all")) return DEMO_PLEX_MEDIA_CONTAINER;
  if (basePath.startsWith("/library/metadata/")) return { MediaContainer: { size: 1, Metadata: [DEMO_PLEX_MEDIA_CONTAINER.MediaContainer.Metadata[0]] } };
  if (basePath === "/identity") return { MediaContainer: { version: "1.40.0" } };
  return undefined;
}
