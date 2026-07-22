import type { ServiceId } from "@/lib/constants";
import { getDateOffset } from "@/lib/utils";

// Local day, not toISOString()'s UTC day — date-only demo dates flow through
// releaseDateKey verbatim and must land on the viewer's calendar day.
function daysFromNow(days: number): string {
  return getDateOffset(days);
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

// /sync/maindata response shape — the Speed Stats widget reads the all-time
// counters (alltime_dl/alltime_ul) so demo mode shows realistic lifetime
// totals rather than just the small session deltas above.
const DEMO_QB_MAINDATA = {
  rid: 0,
  full_update: true,
  server_state: {
    alltime_dl: 891289600000,
    alltime_ul: 892323840000,
    dl_info_speed: 5242880,
    dl_info_data: 107374182400,
    up_info_speed: 1048576,
    up_info_data: 21474836480,
    connection_status: "connected",
  },
};

// Mirrors GET /torrents/categories — keyed by name. Matches the categories
// used by the demo torrents below so the category filter has something to show.
const DEMO_QB_CATEGORIES = {
  movies: { name: "movies", savePath: "/data/torrents/movies" },
  tv: { name: "tv", savePath: "/data/torrents/tv" },
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

// --- SABnzbd ---

const DEMO_SAB_QUEUE = {
  queue: {
    paused: false,
    speed: "4.2 M",
    speedlimit: "0",
    speedlimit_abs: "0",
    size: "8.4 GB",
    sizeleft: "5.1 GB",
    noofslots: 3,
    noofslots_total: 3,
    diskspace1: "248.7",
    diskspace2: "1428.3",
    status: "Downloading",
    kbpersec: "4300.5",
    slots: [
      {
        nzo_id: "SABnzbd_nzo_demo01",
        filename: "Shogun.S01E08.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb",
        cat: "tv",
        status: "Downloading",
        priority: "Normal",
        mb: "3072.0",
        mbleft: "1843.2",
        size: "3.0 GB",
        sizeleft: "1.8 GB",
        percentage: "40",
        timeleft: "0:07:08",
        index: 0,
      },
      {
        nzo_id: "SABnzbd_nzo_demo02",
        filename: "The.Boys.S04E06.2160p.AMZN.WEB-DL.DDP5.1.HDR.H.265-NTb",
        cat: "tv",
        status: "Downloading",
        priority: "High",
        mb: "5120.0",
        mbleft: "2867.2",
        size: "5.0 GB",
        sizeleft: "2.8 GB",
        percentage: "44",
        timeleft: "0:11:06",
        index: 1,
      },
      {
        nzo_id: "SABnzbd_nzo_demo03",
        filename: "A.Quiet.Place.Day.One.2024.1080p.WEB-DL.DDP5.1.H.264-FLUX",
        cat: "movies",
        status: "Queued",
        priority: "Normal",
        mb: "4915.2",
        mbleft: "4915.2",
        size: "4.8 GB",
        sizeleft: "4.8 GB",
        percentage: "0",
        timeleft: "0:00:00",
        index: 2,
      },
    ],
  },
};

const DEMO_SAB_HISTORY = {
  history: {
    total_size: "142.3 GB",
    noofslots: 4,
    slots: [
      {
        nzo_id: "SABnzbd_nzo_done01",
        name: "Dune.Part.Two.2024.2160p.UHD.BluRay.HDR.x265-TERMINAL",
        category: "movies",
        status: "Completed",
        fail_message: "",
        size: "48.3 GB",
        bytes: 51858063360,
        download_time: 4320,
        completed: NOW_TS - 7200,
        storage: "/downloads/movies/Dune.Part.Two.2024",
      },
      {
        nzo_id: "SABnzbd_nzo_done02",
        name: "Fallout.S01E07.1080p.AMZN.WEB-DL.DDP5.1.H.264-NTb",
        category: "tv",
        status: "Completed",
        fail_message: "",
        size: "2.6 GB",
        bytes: 2791728742,
        download_time: 480,
        completed: NOW_TS - 14400,
        storage: "/downloads/tv/Fallout.S01E07",
      },
      {
        nzo_id: "SABnzbd_nzo_done03",
        name: "Severance.S02E01.1080p.ATVP.WEB-DL.DDP5.1.H.264-FLUX",
        category: "tv",
        status: "Completed",
        fail_message: "",
        size: "3.1 GB",
        bytes: 3328599654,
        download_time: 545,
        completed: NOW_TS - 86400,
        storage: "/downloads/tv/Severance.S02E01",
      },
      {
        nzo_id: "SABnzbd_nzo_done04",
        name: "Civil.War.2024.1080p.WEB-DL.DDP5.1.Atmos.H.264-NaB",
        category: "movies",
        status: "Failed",
        fail_message: "Unpack failed: missing files",
        size: "4.5 GB",
        bytes: 4831838208,
        download_time: 720,
        completed: NOW_TS - 172800,
        storage: "",
      },
    ],
  },
};

const DEMO_SAB_VERSION = { version: "4.3.3" };

// --- NZBGet ---
// 64-bit byte counts split across Lo/Hi pairs as the real API does. The split
// boundary is 2^32: bytes >= 2^32 set Hi=1+; tiny demo files all stay Lo-only.

const DEMO_NZBGET_GROUPS = [
  {
    NZBID: 101,
    NZBName: "Demo.Documentary.S01E04.1080p.WEB.x264-DEMO",
    Kind: "NZB",
    Category: "movies",
    Status: "DOWNLOADING",
    Priority: 0,
    Health: 1000,
    FileSizeLo: 2_500_000_000,
    FileSizeHi: 0,
    RemainingSizeLo: 875_000_000,
    RemainingSizeHi: 0,
    DownloadedSizeLo: 1_625_000_000,
    DownloadedSizeHi: 0,
    DownloadRate: 12_500_000,
  },
  {
    NZBID: 102,
    NZBName: "Demo.Album.FLAC.WEB-DEMO",
    Kind: "NZB",
    Category: "music",
    Status: "PAUSED",
    Priority: 0,
    Health: 1000,
    FileSizeLo: 480_000_000,
    FileSizeHi: 0,
    RemainingSizeLo: 320_000_000,
    RemainingSizeHi: 0,
    DownloadedSizeLo: 160_000_000,
    DownloadedSizeHi: 0,
    DownloadRate: 0,
  },
  {
    NZBID: 103,
    NZBName: "Demo.Software.ISO.x86_64.WEB-DEMO",
    Kind: "NZB",
    Category: "",
    Status: "QUEUED",
    Priority: 0,
    Health: 1000,
    FileSizeLo: 4_700_000_000,
    FileSizeHi: 0,
    RemainingSizeLo: 4_700_000_000,
    RemainingSizeHi: 0,
    DownloadedSizeLo: 0,
    DownloadedSizeHi: 0,
    DownloadRate: 0,
  },
];

const DEMO_NZBGET_HISTORY = [
  {
    NZBID: 200,
    NZBName: "Demo.Show.S02E03.720p.WEB.x264-DEMO",
    Category: "tv",
    Status: "SUCCESS/ALL",
    HistoryTime: NOW_TS - 86400,
    FileSizeLo: 1_350_000_000,
    FileSizeHi: 0,
    DownloadedSizeLo: 1_350_000_000,
    DownloadedSizeHi: 0,
    ParStatus: "SUCCESS",
    ScriptStatus: "SUCCESS",
    Kind: "NZB",
  },
  {
    NZBID: 201,
    NZBName: "Demo.Movie.2024.2160p.WEB.x265-DEMO",
    Category: "movies",
    Status: "FAILURE/PAR",
    HistoryTime: NOW_TS - 172800,
    FileSizeLo: 0,
    FileSizeHi: 5,
    DownloadedSizeLo: 0,
    DownloadedSizeHi: 4,
    ParStatus: "FAILURE",
    ScriptStatus: "NONE",
    Kind: "NZB",
  },
];

const DEMO_NZBGET_STATUS = {
  RemainingSizeLo: 5_895_000_000,
  RemainingSizeHi: 0,
  DownloadRate: 12_500_000,
  AverageDownloadRate: 11_800_000,
  DownloadLimit: 0,
  ServerStandBy: false,
  DownloadPaused: false,
  Download2Paused: false,
  ServerPaused: false,
  PostPaused: false,
  ScanPaused: false,
  FreeDiskSpaceLo: 0,
  FreeDiskSpaceHi: 1, // ~4 GB free in the demo
  UpTimeSec: 86400,
  DownloadTimeSec: 36000,
  ThreadCount: 8,
  ResumeTime: 0,
  FeedActive: false,
};

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

// --- Lidarr ---

function makeArtist(
  id: number,
  name: string,
  foreignId: string,
  albumCount: number,
  trackCount: number,
  fileCount: number,
  status = "continuing",
) {
  return {
    id,
    artistName: name,
    foreignArtistId: foreignId,
    sortName: name.toLowerCase(),
    overview: `${name} is an acclaimed act with a deep, genre-defining catalog.`,
    artistType: "Group",
    status,
    ended: status === "ended",
    monitored: true,
    qualityProfileId: 1,
    metadataProfileId: 1,
    rootFolderPath: "/music",
    path: `/music/${name}`,
    genres: ["Rock", "Electronic"],
    images: [],
    added: daysFromNowFull(-180),
    statistics: {
      albumCount,
      trackFileCount: fileCount,
      trackCount,
      totalTrackCount: trackCount,
      sizeOnDisk: fileCount * 8_000_000,
      percentOfTracks: trackCount ? (fileCount / trackCount) * 100 : 0,
    },
  };
}

function makeAlbum(
  id: number,
  title: string,
  artistId: number,
  year: number,
  trackCount: number,
  fileCount: number,
) {
  return {
    id,
    title,
    artistId,
    foreignAlbumId: `album-${id}`,
    overview: `${title} is a landmark release.`,
    monitored: true,
    albumType: "Album",
    releaseDate: `${year}-05-01`,
    genres: ["Rock"],
    images: [],
    duration: trackCount * 240_000,
    mediumCount: 1,
    statistics: {
      trackFileCount: fileCount,
      trackCount,
      totalTrackCount: trackCount,
      sizeOnDisk: fileCount * 8_000_000,
      percentOfTracks: trackCount ? (fileCount / trackCount) * 100 : 0,
    },
  };
}

const DEMO_LIDARR_ARTISTS = [
  makeArtist(1, "Radiohead", "a74b1b7f-71a5-4011-9441-d0b5e4122711", 9, 92, 92),
  makeArtist(2, "Daft Punk", "056e4f3e-d505-4dad-8ec1-d04f521cbb56", 4, 41, 28),
  makeArtist(3, "Pink Floyd", "83d91898-7763-47d7-b03b-b92132375c47", 15, 165, 165, "ended"),
];

const DEMO_LIDARR_ALBUMS = [
  { ...makeAlbum(11, "OK Computer", 1, 1997, 12, 12), artist: DEMO_LIDARR_ARTISTS[0] },
  { ...makeAlbum(12, "In Rainbows", 1, 2007, 10, 10), artist: DEMO_LIDARR_ARTISTS[0] },
  { ...makeAlbum(21, "Discovery", 2, 2001, 14, 14), artist: DEMO_LIDARR_ARTISTS[1] },
  { ...makeAlbum(22, "Random Access Memories", 2, 2013, 13, 6), artist: DEMO_LIDARR_ARTISTS[1] },
  { ...makeAlbum(31, "The Dark Side of the Moon", 3, 1973, 10, 10), artist: DEMO_LIDARR_ARTISTS[2] },
];

const DEMO_LIDARR_TRACKS = [
  { id: 1101, title: "Airbag", trackNumber: "1", absoluteTrackNumber: 1, duration: 284_000, mediumNumber: 1, hasFile: true, albumId: 11, artistId: 1 },
  { id: 1102, title: "Paranoid Android", trackNumber: "2", absoluteTrackNumber: 2, duration: 383_000, mediumNumber: 1, hasFile: true, albumId: 11, artistId: 1 },
  { id: 1103, title: "Subterranean Homesick Alien", trackNumber: "3", absoluteTrackNumber: 3, duration: 267_000, mediumNumber: 1, hasFile: true, albumId: 11, artistId: 1 },
  { id: 1104, title: "Exit Music (For a Film)", trackNumber: "4", absoluteTrackNumber: 4, duration: 264_000, mediumNumber: 1, hasFile: true, albumId: 11, artistId: 1 },
];

const DEMO_LIDARR_QUEUE = {
  page: 1,
  pageSize: 20,
  totalRecords: 1,
  records: [
    {
      id: 401,
      artistId: 2,
      albumId: 22,
      title: "Daft.Punk.Random.Access.Memories.2013.FLAC",
      status: "downloading",
      trackedDownloadStatus: "ok",
      trackedDownloadState: "downloading",
      statusMessages: [],
      size: 524_288_000,
      sizeleft: 262_144_000,
      timeleft: "00:08:00",
      estimatedCompletionTime: daysFromNowFull(0.01),
      protocol: "torrent",
      downloadClient: "qBittorrent",
      quality: { quality: { name: "FLAC" } },
      artist: DEMO_LIDARR_ARTISTS[1],
      album: DEMO_LIDARR_ALBUMS[3],
    },
  ],
};

const DEMO_LIDARR_WANTED = {
  page: 1,
  pageSize: 20,
  totalRecords: 1,
  records: [DEMO_LIDARR_ALBUMS[3]],
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
  // kbps — consistent with the two demo sessions below (8000 + 6000).
  total_bandwidth: 14000,
  wan_bandwidth: 8000,
  lan_bandwidth: 6000,
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
      video_decision: "direct play",
      audio_decision: "direct play",
      subtitle_decision: "",
      video_codec: "hevc",
      stream_video_codec: "hevc",
      video_full_resolution: "1080p",
      stream_video_full_resolution: "1080p",
      audio_codec: "eac3",
      stream_audio_codec: "eac3",
      audio_channel_layout: "5.1",
      stream_audio_channel_layout: "5.1",
      subtitle_codec: "",
      subtitle_language: "",
      container: "mkv",
      stream_container: "mkv",
      bitrate: "8000",
      stream_bitrate: "8000",
      video_bitrate: "7232",
      stream_video_bitrate: "7232",
      audio_bitrate: "768",
      stream_audio_bitrate: "768",
    },
    {
      session_key: "def456",
      session_id: "sess2",
      media_type: "episode",
      title: "The Big Door Prize",
      parent_title: "Season 1",
      grandparent_title: "Fallout",
      full_title: "Fallout - The Big Door Prize",
      parent_media_index: "1",
      media_index: "5",
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
      video_decision: "transcode",
      audio_decision: "transcode",
      subtitle_decision: "burn",
      video_codec: "hevc",
      stream_video_codec: "h264",
      video_full_resolution: "1080p",
      stream_video_full_resolution: "720p",
      audio_codec: "truehd",
      stream_audio_codec: "aac",
      audio_channel_layout: "7.1",
      stream_audio_channel_layout: "2.0",
      subtitle_codec: "pgs",
      subtitle_language: "English",
      container: "mkv",
      stream_container: "mp4",
      bitrate: "9000",
      stream_bitrate: "6000",
      video_bitrate: "9000",
      stream_video_bitrate: "5232",
      audio_bitrate: "1509",
      stream_audio_bitrate: "256",
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

// --- Tracearr ---
// Shapes match the read-only public API (/api/v1/public). posterUrl is null in
// demo mode (no image proxy), so tiles fall back to the placeholder.

const DEMO_TRACEARR_STREAMS = {
  data: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      serverId: "aaaaaaaa-0000-0000-0000-000000000001",
      serverName: "Main Plex",
      username: "john_smith",
      userAvatarUrl: null,
      mediaTitle: "Dune: Part Two",
      mediaType: "movie",
      showTitle: null,
      seasonNumber: null,
      episodeNumber: null,
      year: 2024,
      durationMs: 9960000,
      state: "playing",
      progressMs: 4681200,
      startedAt: new Date((NOW_TS - 2800) * 1000).toISOString(),
      thumbPath: null,
      posterUrl: null,
      isTranscode: false,
      videoDecision: "directplay",
      audioDecision: "directplay",
      resolution: "4K",
      device: "Apple TV",
      player: "Plex for Apple TV",
      product: "Plex for Apple TV",
      platform: "tvOS",
    },
    {
      id: "22222222-2222-2222-2222-222222222222",
      serverId: "aaaaaaaa-0000-0000-0000-000000000002",
      serverName: "Jellyfin",
      username: "sarah_c",
      userAvatarUrl: null,
      mediaTitle: "The Big Door Prize",
      mediaType: "episode",
      showTitle: "Fallout",
      seasonNumber: 1,
      episodeNumber: 3,
      year: 2024,
      durationMs: 3720000,
      state: "paused",
      progressMs: 855600,
      startedAt: new Date((NOW_TS - 1200) * 1000).toISOString(),
      thumbPath: null,
      posterUrl: null,
      isTranscode: true,
      videoDecision: "transcode",
      audioDecision: "copy",
      resolution: "1080p",
      device: "Chrome",
      player: "Jellyfin Web",
      product: "Jellyfin Web",
      platform: "Chrome",
    },
  ],
  summary: {
    total: 2,
    transcodes: 1,
    directStreams: 0,
    directPlays: 1,
    totalBitrate: "22.5 Mbps",
  },
};

const DEMO_TRACEARR_HISTORY = {
  data: [
    {
      id: "aaaa1111-0000-0000-0000-000000000001",
      serverId: "aaaaaaaa-0000-0000-0000-000000000001",
      serverName: "Main Plex",
      state: "stopped",
      mediaTitle: "Oppenheimer",
      mediaType: "movie",
      showTitle: null,
      seasonNumber: null,
      episodeNumber: null,
      year: 2023,
      durationMs: 3600000,
      progressMs: 3600000,
      totalDurationMs: 3600000,
      startedAt: new Date((NOW_TS - 7200) * 1000).toISOString(),
      stoppedAt: new Date((NOW_TS - 3600) * 1000).toISOString(),
      watched: true,
      resolution: "4K",
      thumbPath: null,
      posterUrl: null,
      device: "Apple TV",
      player: "Plex for Apple TV",
      platform: "tvOS",
      user: { id: "u1", username: "john_smith", thumbUrl: null, avatarUrl: null },
    },
    {
      id: "aaaa1111-0000-0000-0000-000000000002",
      serverId: "aaaaaaaa-0000-0000-0000-000000000002",
      serverName: "Jellyfin",
      state: "stopped",
      mediaTitle: "The Big Door Prize",
      mediaType: "episode",
      showTitle: "Fallout",
      seasonNumber: 1,
      episodeNumber: 3,
      year: 2024,
      durationMs: 3060000,
      progressMs: 3060000,
      totalDurationMs: 3720000,
      startedAt: new Date((NOW_TS - 90000) * 1000).toISOString(),
      stoppedAt: new Date((NOW_TS - 86400) * 1000).toISOString(),
      watched: false,
      resolution: "1080p",
      thumbPath: null,
      posterUrl: null,
      device: "Chrome",
      player: "Jellyfin Web",
      platform: "Chrome",
      user: { id: "u2", username: "sarah_c", thumbUrl: null, avatarUrl: null },
    },
  ],
  meta: { total: 2, page: 1, pageSize: 30 },
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

// --- Jackett ---

// Torznab t=indexers response — a raw XML string because the real endpoint is
// XML and services/jackett-api.ts parses whatever serviceRequest returns.
const DEMO_JACKETT_INDEXERS_XML = `<?xml version="1.0" encoding="utf-8"?>
<indexers>
  <indexer id="1337x" configured="true">
    <title>1337x</title>
    <description>1337x is a Public torrent site that offers verified torrent downloads</description>
    <link>https://1337x.to/</link>
    <language>en-US</language>
    <type>public</type>
  </indexer>
  <indexer id="eztv" configured="true">
    <title>EZTV</title>
    <description>EZTV is a Public torrent site for TV shows</description>
    <link>https://eztvx.to/</link>
    <language>en-US</language>
    <type>public</type>
  </indexer>
  <indexer id="demo-tracker" configured="true">
    <title>DemoTracker</title>
    <description>A Private tracker for demo releases</description>
    <link>https://demo-tracker.example/</link>
    <language>en-US</language>
    <type>private</type>
  </indexer>
</indexers>`;

// JSON manual-search response. One magnet-only and one Link-only release so
// the grab sheet's uri fallback chain is exercised in demo mode.
const DEMO_JACKETT_RESULTS = {
  Results: [
    {
      Guid: "https://1337x.to/torrent/demo-1",
      Title: "Demo.Movie.2024.1080p.BluRay.x264-GROUP",
      Tracker: "1337x",
      TrackerId: "1337x",
      CategoryDesc: "Movies",
      PublishDate: daysFromNowFull(-2),
      Size: 9663676416,
      Seeders: 482,
      Peers: 23,
      Grabs: 87,
      Link: null,
      MagnetUri: "magnet:?xt=urn:btih:0000000000000000000000000000000000000001&dn=Demo.Movie.2024",
      Details: "https://1337x.to/torrent/demo-1",
    },
    {
      Guid: "https://demo-tracker.example/details/42",
      Title: "Demo.Movie.2024.2160p.UHD.BluRay.HDR.x265-GROUP",
      Tracker: "DemoTracker",
      TrackerId: "demo-tracker",
      CategoryDesc: "Movies/UHD",
      PublishDate: daysFromNowFull(-3),
      Size: 48318382080,
      Seeders: 127,
      Peers: 8,
      Grabs: 31,
      Link: "https://demo-tracker.example/dl/42.torrent",
      MagnetUri: null,
      Details: "https://demo-tracker.example/details/42",
    },
    {
      Guid: "https://eztvx.to/ep/demo-3",
      Title: "Demo.Show.S01E05.1080p.WEB.h264-GROUP",
      Tracker: "EZTV",
      TrackerId: "eztv",
      CategoryDesc: "TV",
      PublishDate: daysFromNowFull(-1),
      Size: 2147483648,
      Seeders: 913,
      Peers: 64,
      Grabs: 210,
      Link: "https://eztvx.to/dl/demo-3.torrent",
      MagnetUri: "magnet:?xt=urn:btih:0000000000000000000000000000000000000003&dn=Demo.Show.S01E05",
      Details: "https://eztvx.to/ep/demo-3",
    },
  ],
  Indexers: [
    { ID: "1337x", Name: "1337x", Status: 0, Results: 1, Error: null },
    { ID: "eztv", Name: "EZTV", Status: 0, Results: 1, Error: null },
    { ID: "demo-tracker", Name: "DemoTracker", Status: 0, Results: 1, Error: null },
  ],
};

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

// --- Jellyfin ---

const DEMO_JELLYFIN_USER_ID = "demo-user-id-0001";

const DEMO_JELLYFIN_ME = {
  Id: DEMO_JELLYFIN_USER_ID,
  Name: "demo",
  Policy: { IsAdministrator: true, IsDisabled: false },
};

const DEMO_JELLYFIN_USERS = [DEMO_JELLYFIN_ME];

const DEMO_JELLYFIN_VIEWS = {
  Items: [
    { Id: "lib-movies", Name: "Movies", CollectionType: "movies", ImageTags: { Primary: "tag-movies" } },
    { Id: "lib-tv", Name: "TV Shows", CollectionType: "tvshows", ImageTags: { Primary: "tag-tv" } },
    { Id: "lib-music", Name: "Music", CollectionType: "music", ImageTags: { Primary: "tag-music" } },
  ],
  TotalRecordCount: 3,
};

const DEMO_JELLYFIN_LATEST: unknown[] = [
  { Id: "jf-1", Name: "Dune: Part Two", Type: "Movie", ProductionYear: 2024, RunTimeTicks: 9960000 * 10000, DateCreated: new Date(NOW_TS * 1000 - 3600 * 1000).toISOString(), ImageTags: { Primary: "tag-1" } },
  { Id: "jf-2", Name: "Oppenheimer", Type: "Movie", ProductionYear: 2023, RunTimeTicks: 11040000 * 10000, DateCreated: new Date(NOW_TS * 1000 - 86400 * 1000).toISOString(), ImageTags: { Primary: "tag-2" } },
  { Id: "jf-3", Name: "The End", Type: "Episode", SeriesName: "Fallout", SeriesId: "jf-series-fallout", SeasonName: "Season 1", ParentIndexNumber: 1, IndexNumber: 8, RunTimeTicks: 4200000 * 10000, DateCreated: new Date(NOW_TS * 1000 - 7200 * 1000).toISOString(), ImageTags: { Primary: "tag-3" }, SeriesPrimaryImageTag: "tag-series-fallout" },
  { Id: "jf-4", Name: "The Big Door Prize", Type: "Episode", SeriesName: "Fallout", SeriesId: "jf-series-fallout", SeasonName: "Season 1", ParentIndexNumber: 1, IndexNumber: 5, RunTimeTicks: 3720000 * 10000, DateCreated: new Date(NOW_TS * 1000 - 3600 * 1000).toISOString(), ImageTags: { Primary: "tag-4" }, SeriesPrimaryImageTag: "tag-series-fallout" },
];

const DEMO_JELLYFIN_RESUME = {
  Items: [
    { Id: "jf-r1", Name: "Dune: Part Two", Type: "Movie", ProductionYear: 2024, RunTimeTicks: 9960000 * 10000, UserData: { PlaybackPositionTicks: 4681200 * 10000, PlayedPercentage: 47 }, ImageTags: { Primary: "tag-1" } },
    { Id: "jf-r2", Name: "The Radio", Type: "Episode", SeriesName: "Fallout", SeriesId: "jf-series-fallout", ParentIndexNumber: 1, IndexNumber: 6, RunTimeTicks: 3780000 * 10000, UserData: { PlaybackPositionTicks: 1500000 * 10000, PlayedPercentage: 39 }, ImageTags: { Primary: "tag-r2" }, SeriesPrimaryImageTag: "tag-series-fallout" },
  ],
  TotalRecordCount: 2,
};

const DEMO_JELLYFIN_SESSIONS = [
  {
    Id: "session-demo-1",
    UserId: DEMO_JELLYFIN_USER_ID,
    UserName: "demo",
    Client: "Jellyfin Web",
    DeviceName: "Living Room TV",
    DeviceId: "device-1",
    ApplicationVersion: "10.8.13",
    RemoteEndPoint: "192.168.1.45",
    IsActive: true,
    NowPlayingItem: {
      Id: "jf-1",
      Name: "Dune: Part Two",
      Type: "Movie",
      ProductionYear: 2024,
      RunTimeTicks: 9960000 * 10000,
      ImageTags: { Primary: "tag-1" },
    },
    PlayState: { PositionTicks: 4681200 * 10000, IsPaused: false, PlayMethod: "Transcode" },
    // Local transcode → LAN bucket (4 Mbps).
    TranscodingInfo: { VideoCodec: "h264", Bitrate: 4000000, CompletionPercentage: 0 },
  },
  {
    Id: "session-demo-2",
    UserId: DEMO_JELLYFIN_USER_ID,
    UserName: "alex",
    Client: "Jellyfin Android",
    DeviceName: "Pixel 8",
    DeviceId: "device-2",
    ApplicationVersion: "2.6.1",
    RemoteEndPoint: "203.0.113.45",
    IsActive: true,
    NowPlayingItem: {
      Id: "jf-2",
      Name: "Half Loop",
      Type: "Episode",
      SeriesName: "Severance",
      ParentIndexNumber: 1,
      IndexNumber: 2,
      ProductionYear: 2024,
      RunTimeTicks: 3120000 * 10000,
      ImageTags: { Primary: "tag-1" },
    },
    PlayState: { PositionTicks: 1200000 * 10000, IsPaused: false, PlayMethod: "Transcode" },
    // Remote transcode → WAN bucket (8 Mbps).
    TranscodingInfo: { VideoCodec: "h264", Bitrate: 8000000, CompletionPercentage: 0 },
  },
];

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
const DEMO_GLANCES_NET = [
  { interface_name: "eth0", is_up: true, bytes_recv: 8650752, bytes_sent: 1153024, bytes_recv_rate_per_sec: 8650752, bytes_sent_rate_per_sec: 1153024, speed: 1000000000, time_since_update: 1 },
  { interface_name: "wg0", is_up: true, bytes_recv: 245760, bytes_sent: 92160, bytes_recv_rate_per_sec: 245760, bytes_sent_rate_per_sec: 92160, speed: 0, time_since_update: 1 },
  // Virtual (Docker) interfaces — grouped/hidden in the picker, excluded from "all".
  { interface_name: "docker0", is_up: true, bytes_recv: 131072, bytes_sent: 196608, bytes_recv_rate_per_sec: 131072, bytes_sent_rate_per_sec: 196608, speed: 0, time_since_update: 1 },
  { interface_name: "veth9a1b2c", is_up: true, bytes_recv: 40960, bytes_sent: 20480, bytes_recv_rate_per_sec: 40960, bytes_sent_rate_per_sec: 20480, speed: 10000000000, time_since_update: 1 },
  { interface_name: "lo", is_up: true, bytes_recv: 524288, bytes_sent: 524288, bytes_recv_rate_per_sec: 524288, bytes_sent_rate_per_sec: 524288, speed: 0, time_since_update: 1 },
];
const DEMO_GLANCES_GPU = [
  { key: "gpu_id", gpu_id: "0", name: "NVIDIA GeForce RTX 3060", mem: 42.5, proc: 28.0, temperature: 54, fan_speed: 38 },
];
const DEMO_GLANCES_CONTAINERS = [
  { id: "a1b2c3d4e5f6", name: "plex", status: "running", image: ["plexinc/pms-docker:latest"], cpu_percent: 18.4, memory_usage: 1503238553, memory_limit: 8589934592, uptime: "6 days", engine: "docker" },
  { id: "b2c3d4e5f6a1", name: "qbittorrent", status: "running", image: ["lscr.io/linuxserver/qbittorrent:latest"], cpu_percent: 4.2, memory_usage: 524288000, memory_limit: 8589934592, uptime: "6 days", engine: "docker" },
  { id: "c3d4e5f6a1b2", name: "sonarr", status: "running", image: ["lscr.io/linuxserver/sonarr:latest"], cpu_percent: 1.1, memory_usage: 312475648, memory_limit: 8589934592, uptime: "2 days", engine: "docker" },
  { id: "d4e5f6a1b2c3", name: "radarr", status: "running", image: ["lscr.io/linuxserver/radarr:latest"], cpu_percent: 0.9, memory_usage: 298844160, memory_limit: 8589934592, uptime: "2 days", engine: "docker" },
  { id: "e5f6a1b2c3d4", name: "prowlarr", status: "paused", image: ["lscr.io/linuxserver/prowlarr:latest"], cpu_percent: 0, memory_usage: 0, memory_limit: 8589934592, uptime: "", engine: "docker" },
  { id: "f6a1b2c3d4e5", name: "bazarr", status: "exited", image: ["lscr.io/linuxserver/bazarr:latest"], cpu_percent: 0, memory_usage: 0, memory_limit: 8589934592, uptime: "", engine: "docker" },
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

// --- rtorrent (XML-RPC) demo fixtures ---
// The rtorrent api POSTs XML-RPC and runs the response through the real XML
// parser (lib/xmlrpc.ts), so the demo router must return canned XML STRINGS,
// not JS objects. The fixtures deliberately mix <i8> (byte counts) and <i4>
// (rates/flags) so the parser's typed-value path is exercised in demo too.
type RtVal = { s: string } | { i: number } | { i8: number };
function rtValue(v: RtVal): string {
  if ("s" in v) return `<value><string>${v.s}</string></value>`;
  if ("i8" in v) return `<value><i8>${v.i8}</i8></value>`;
  return `<value><i4>${v.i}</i4></value>`;
}
function rtArray(vals: RtVal[]): string {
  return `<value><array><data>${vals.map(rtValue).join("")}</data></array></value>`;
}
function rtResponse(topValue: string): string {
  return `<?xml version="1.0"?><methodResponse><params><param>${topValue}</param></params></methodResponse>`;
}
// d.multicall2 rows, in services/rtorrent-api.ts D_FIELDS order: hash, name,
// size_bytes, bytes_done, completed_bytes, left_bytes, down.rate, up.rate,
// state, is_active, complete, hashing, is_hash_checking, ratio(per-mille),
// message, custom1(label), directory, base_path, timestamp.started.
const DEMO_RTORRENT_ROWS: RtVal[][] = [
  [
    { s: "00000000000000000000000000000000000000A1" },
    { s: "Ubuntu 24.04.1 LTS Desktop amd64" },
    { i8: 5_400_000_000 }, { i8: 2_160_000_000 }, { i8: 2_160_000_000 },
    { i8: 3_240_000_000 }, { i: 5_400_000 }, { i: 180_000 },
    { i: 1 }, { i: 1 }, { i: 0 }, { i: 0 }, { i: 0 }, { i: 240 },
    { s: "" }, { s: "linux-isos" }, { s: "/downloads" },
    { s: "/downloads/ubuntu-24.04.1-desktop-amd64.iso" }, { i: 1_716_800_000 },
  ],
  [
    { s: "00000000000000000000000000000000000000B2" },
    { s: "Debian 12.5.0 amd64 netinst" },
    { i8: 3_900_000_000 }, { i8: 3_900_000_000 }, { i8: 3_900_000_000 },
    { i8: 0 }, { i: 0 }, { i: 920_000 },
    { i: 1 }, { i: 1 }, { i: 1 }, { i: 0 }, { i: 0 }, { i: 1_840 },
    { s: "" }, { s: "linux-isos" }, { s: "/downloads" },
    { s: "/downloads/debian-12.5.0-amd64-netinst.iso" }, { i: 1_716_600_000 },
  ],
  [
    { s: "00000000000000000000000000000000000000C3" },
    { s: "Arch Linux 2024.05.01 x86_64" },
    { i8: 1_050_000_000 }, { i8: 525_000_000 }, { i8: 525_000_000 },
    { i8: 525_000_000 }, { i: 0 }, { i: 0 },
    { i: 1 }, { i: 0 }, { i: 0 }, { i: 0 }, { i: 0 }, { i: 0 },
    { s: "" }, { s: "" }, { s: "/downloads" },
    { s: "/downloads/archlinux-2024.05.01-x86_64.iso" }, { i: 1_716_500_000 },
  ],
];
const DEMO_RTORRENT_MULTICALL_XML = rtResponse(
  `<value><array><data>${DEMO_RTORRENT_ROWS.map(rtArray).join("")}</data></array></value>`,
);
// system.multicall wraps each sub-call result in a single-element array. Stats
// order matches getRtorrentGlobalStats: down.rate, up.rate, down.total,
// up.total, down.max_rate, up.max_rate.
const DEMO_RTORRENT_STATS_XML = rtResponse(
  `<value><array><data>${[
    rtArray([{ i: 5_400_000 }]),
    rtArray([{ i: 1_100_000 }]),
    rtArray([{ i8: 850_000_000_000 }]),
    rtArray([{ i8: 420_000_000_000 }]),
    rtArray([{ i: 0 }]),
    rtArray([{ i: 0 }]),
  ].join("")}</data></array></value>`,
);
// Generic system.multicall ack for actions (start/stop/erase/set-limits). The
// action helpers ignore the body, so any well-formed array decodes fine.
const DEMO_RTORRENT_OK_XML = rtResponse(
  `<value><array><data>${rtArray([{ i: 0 }])}</data></array></value>`,
);
// Single-value response for load.start (add torrent).
const DEMO_RTORRENT_SCALAR_OK_XML = rtResponse(`<value><i4>0</i4></value>`);

// --- Transmission (JSON-RPC) demo fixtures ---
// transmissionRpc returns getDemoResponse() verbatim in demo mode, so these are
// the `arguments` payloads as plain JS objects (camelCase torrent fields,
// hyphenated session/stats keys) — the same shapes the service maps.
const DEMO_TRANSMISSION_TORRENTS = [
  {
    hashString: "0000000000000000000000000000000000000a01",
    name: "Ubuntu 24.04.1 LTS Desktop amd64",
    totalSize: 5_400_000_000,
    percentDone: 0.4,
    rateDownload: 5_400_000,
    rateUpload: 180_000,
    eta: 600,
    uploadRatio: 0.12,
    status: 4,
    downloadDir: "/downloads",
    addedDate: 1_716_800_000,
    doneDate: 0,
    leftUntilDone: 3_240_000_000,
    downloadedEver: 2_160_000_000,
    uploadedEver: 259_000_000,
    error: 0,
    errorString: "",
    labels: ["linux-isos"],
    files: [
      { name: "ubuntu-24.04.1-desktop-amd64.iso", length: 5_400_000_000, bytesCompleted: 2_160_000_000 },
    ],
    fileStats: [{ bytesCompleted: 2_160_000_000, wanted: true, priority: 0 }],
    trackerStats: [
      {
        announce: "https://torrent.ubuntu.com/announce",
        host: "torrent.ubuntu.com",
        seederCount: 1240,
        leecherCount: 86,
        lastAnnounceResult: "Success",
      },
    ],
    seedRatioLimit: 2,
    seedRatioMode: 0,
    seedIdleLimit: 30,
    seedIdleMode: 0,
  },
  {
    hashString: "0000000000000000000000000000000000000b02",
    name: "Debian 12.5.0 amd64 netinst",
    totalSize: 3_900_000_000,
    percentDone: 1,
    rateDownload: 0,
    rateUpload: 920_000,
    eta: -1,
    uploadRatio: 1.34,
    status: 6,
    downloadDir: "/downloads",
    addedDate: 1_716_600_000,
    doneDate: 1_716_690_000,
    leftUntilDone: 0,
    downloadedEver: 3_900_000_000,
    uploadedEver: 5_226_000_000,
    error: 0,
    errorString: "",
    labels: ["linux-isos"],
    files: [
      { name: "debian-12.5.0-amd64-netinst.iso", length: 3_900_000_000, bytesCompleted: 3_900_000_000 },
    ],
    fileStats: [{ bytesCompleted: 3_900_000_000, wanted: true, priority: 0 }],
    trackerStats: [
      {
        announce: "https://bttracker.debian.org:6969/announce",
        host: "bttracker.debian.org",
        seederCount: 870,
        leecherCount: 14,
        lastAnnounceResult: "Success",
      },
    ],
    seedRatioLimit: 2,
    seedRatioMode: 0,
    seedIdleLimit: 30,
    seedIdleMode: 0,
  },
  {
    hashString: "0000000000000000000000000000000000000c03",
    name: "Arch Linux 2024.05.01 x86_64",
    totalSize: 1_050_000_000,
    percentDone: 0.5,
    rateDownload: 0,
    rateUpload: 0,
    eta: -1,
    uploadRatio: 0.4,
    status: 0,
    downloadDir: "/downloads",
    addedDate: 1_716_500_000,
    doneDate: 0,
    leftUntilDone: 525_000_000,
    downloadedEver: 525_000_000,
    uploadedEver: 210_000_000,
    error: 0,
    errorString: "",
    labels: [],
    files: [
      { name: "archlinux-2024.05.01-x86_64.iso", length: 1_050_000_000, bytesCompleted: 525_000_000 },
    ],
    fileStats: [{ bytesCompleted: 525_000_000, wanted: true, priority: 0 }],
    trackerStats: [],
    seedRatioLimit: 0,
    seedRatioMode: 0,
    seedIdleLimit: 0,
    seedIdleMode: 0,
  },
];
const DEMO_TRANSMISSION_STATS = {
  downloadSpeed: 5_400_000,
  uploadSpeed: 1_100_000,
  "cumulative-stats": {
    downloadedBytes: 850_000_000_000,
    uploadedBytes: 420_000_000_000,
  },
};
const DEMO_TRANSMISSION_SESSION = {
  "speed-limit-down": 0,
  "speed-limit-down-enabled": false,
  "speed-limit-up": 500,
  "speed-limit-up-enabled": true,
  "alt-speed-down": 100,
  "alt-speed-up": 50,
  "alt-speed-enabled": false,
};

// Shared across radarr/sonarr/lidarr — the /diskspace payload is identical on
// all three. Percentages chosen to exercise the amber (≥70%) and red (≥85%)
// bar thresholds in demo screenshots.
const DEMO_ARR_DISKSPACE = [
  { path: "/", label: "/", freeSpace: 48_000_000_000, totalSpace: 250_000_000_000 }, // ~81% used → amber
  { path: "/data", label: "/data", freeSpace: 2_400_000_000_000, totalSpace: 16_000_000_000_000 }, // ~85% used → red
];

// System > Health issues for the *arr alert badge (#210). Sonarr shows the
// issue from the feature request (a long-down indexer) plus an update notice;
// Radarr/Prowlarr a warning each; Lidarr is healthy (empty) to show the
// no-badge case.
const DEMO_SONARR_HEALTH = [
  {
    source: "IndexerStatusCheck",
    type: "error",
    message: "Indexers unavailable due to failures for more than 6 hours: NZBgeek",
    wikiUrl: "https://wiki.servarr.com/sonarr/system#indexers-are-unavailable-due-to-failures",
  },
  {
    source: "UpdateCheck",
    type: "warning",
    message: "New update is available",
    wikiUrl: "https://wiki.servarr.com/sonarr/system#updates",
  },
];
const DEMO_RADARR_HEALTH = [
  {
    source: "ImportListStatusCheck",
    type: "warning",
    message: "Lists unavailable due to failures: Trakt Watchlist",
    wikiUrl: "https://wiki.servarr.com/radarr/system#lists-are-unavailable-due-to-failures",
  },
];
const DEMO_PROWLARR_HEALTH = [
  {
    source: "IndexerStatusCheck",
    type: "warning",
    message: "Indexers unavailable due to failures for more than 6 hours: 1337x",
    wikiUrl: "https://wiki.servarr.com/prowlarr/system#indexers-are-unavailable-due-to-failures",
  },
];

// --- unRAID (GraphQL) ---
// unraid-api.ts unwraps the {data} envelope itself, so these payloads are
// envelope-shaped. BigInt fields are strings on the wire — kept as strings
// here to exercise the toNum coercion path.

const DEMO_UNRAID_CONTAINERS = [
  { id: "c1", names: ["/plex"], image: "lscr.io/linuxserver/plex:latest", state: "RUNNING", status: "Up 12 days", autoStart: true, isUpdateAvailable: false, isOrphaned: false },
  { id: "c2", names: ["/radarr"], image: "lscr.io/linuxserver/radarr:latest", state: "RUNNING", status: "Up 12 days", autoStart: true, isUpdateAvailable: true, isOrphaned: false },
  { id: "c3", names: ["/sonarr"], image: "lscr.io/linuxserver/sonarr:latest", state: "RUNNING", status: "Up 12 days", autoStart: true, isUpdateAvailable: false, isOrphaned: false },
  { id: "c4", names: ["/qbittorrent"], image: "lscr.io/linuxserver/qbittorrent:latest", state: "RUNNING", status: "Up 3 days", autoStart: true, isUpdateAvailable: false, isOrphaned: false },
  { id: "c5", names: ["/postgres"], image: "postgres:16", state: "EXITED", status: "Exited (0) 2 weeks ago", autoStart: false, isUpdateAvailable: false, isOrphaned: false },
  { id: "c6", names: ["/homeassistant"], image: "ghcr.io/home-assistant/home-assistant:stable", state: "RUNNING", status: "Up 12 days", autoStart: true, isUpdateAvailable: false, isOrphaned: false },
];

// One ArrayDisk row per role: 2 parity, 4 data (one warm at 86% to exercise
// the red bar), a 2-disk "cache" pool + a named "nvme" pool.
const DEMO_UNRAID_ARRAY = {
  state: "STARTED",
  capacity: { disks: { free: "14200000000000", used: "25800000000000", total: "40000000000000" } },
  parities: [
    { idx: 0, name: "parity", device: "sdb", size: "10000831348736", status: "DISK_OK", type: "PARITY", temp: 34, rotational: true, isSpinning: true, fsSize: null, fsFree: null, fsUsed: null, fsType: null },
    { idx: 29, name: "parity2", device: "sdc", size: "10000831348736", status: "DISK_OK", type: "PARITY", temp: 33, rotational: true, isSpinning: false, fsSize: null, fsFree: null, fsUsed: null, fsType: null },
  ],
  disks: [
    { idx: 1, name: "disk1", device: "sdd", size: "10000831348736", status: "DISK_OK", type: "DATA", temp: 36, rotational: true, isSpinning: true, fsSize: "10000000000000", fsFree: "1400000000000", fsUsed: "8600000000000", fsType: "xfs" },
    { idx: 2, name: "disk2", device: "sde", size: "10000831348736", status: "DISK_OK", type: "DATA", temp: 35, rotational: true, isSpinning: true, fsSize: "10000000000000", fsFree: "4200000000000", fsUsed: "5800000000000", fsType: "xfs" },
    { idx: 3, name: "disk3", device: "sdf", size: "10000831348736", status: "DISK_OK", type: "DATA", temp: 31, rotational: true, isSpinning: false, fsSize: "10000000000000", fsFree: "5100000000000", fsUsed: "4900000000000", fsType: "xfs" },
    { idx: 4, name: "disk4", device: "sdg", size: "10000831348736", status: "DISK_OK", type: "DATA", temp: 30, rotational: true, isSpinning: false, fsSize: "10000000000000", fsFree: "3500000000000", fsUsed: "6500000000000", fsType: "xfs" },
  ],
  caches: [
    { idx: 30, name: "cache", device: "nvme0n1", size: "1000204886016", status: "DISK_OK", type: "CACHE", temp: 42, rotational: false, isSpinning: true, fsSize: "2000000000000", fsFree: "1240000000000", fsUsed: "760000000000", fsType: "btrfs" },
    { idx: 31, name: "cache2", device: "nvme1n1", size: "1000204886016", status: "DISK_OK", type: "CACHE", temp: 44, rotational: false, isSpinning: true, fsSize: "2000000000000", fsFree: "1240000000000", fsUsed: "760000000000", fsType: "btrfs" },
    { idx: 32, name: "apps", device: "nvme2n1", size: "500107862016", status: "DISK_OK", type: "CACHE", temp: 39, rotational: false, isSpinning: true, fsSize: "500000000000", fsFree: "310000000000", fsUsed: "190000000000", fsType: "btrfs" },
  ],
  boot: { idx: 33, name: "flash", device: "sda", size: "31029460992" },
};

// Physical disks: everything the array claims plus two unassigned devices
// (drives the Unassigned group in demo mode).
const DEMO_UNRAID_DISKS = [
  ...["sdb", "sdc", "sdd", "sde", "sdf", "sdg"].map((device, i) => ({
    id: `disk-${device}`,
    device,
    name: `WDC WD100EFAX-68 (${device})`,
    vendor: "Western Digital",
    size: 10000831348736,
    serialNum: `WD-JEHT000${i}`,
    temperature: 33,
    smartStatus: "OK",
    isSpinning: i < 3,
    interfaceType: "SATA",
  })),
  { id: "disk-nvme0n1", device: "nvme0n1", name: "Samsung 970 EVO 1TB", vendor: "Samsung", size: 1000204886016, serialNum: "S467NX0M400001", temperature: 42, smartStatus: "OK", isSpinning: true, interfaceType: "PCIe" },
  { id: "disk-nvme1n1", device: "nvme1n1", name: "Samsung 970 EVO 1TB", vendor: "Samsung", size: 1000204886016, serialNum: "S467NX0M400002", temperature: 44, smartStatus: "OK", isSpinning: true, interfaceType: "PCIe" },
  { id: "disk-nvme2n1", device: "nvme2n1", name: "WD Black SN770 500GB", vendor: "Western Digital", size: 500107862016, serialNum: "23111J440105", temperature: 39, smartStatus: "OK", isSpinning: true, interfaceType: "PCIe" },
  { id: "disk-sda", device: "sda", name: "SanDisk Cruzer 32GB", vendor: "SanDisk", size: 31029460992, serialNum: "4C530001180322101234", temperature: null, smartStatus: "OK", isSpinning: true, interfaceType: "USB" },
  { id: "disk-sdh", device: "sdh", name: "Seagate IronWolf 8TB (sdh)", vendor: "Seagate", size: 8001563222016, serialNum: "ZA1B2C3D", temperature: 29, smartStatus: "OK", isSpinning: false, interfaceType: "SATA" },
  { id: "disk-sdi", device: "sdi", name: "Kingston A400 240GB (sdi)", vendor: "Kingston", size: 240057409536, serialNum: "50026B7682D8E5F1", temperature: 27, smartStatus: "OK", isSpinning: true, interfaceType: "SATA" },
];

export function getDemoResponse(
  serviceId: ServiceId,
  path: string,
  params?: Record<string, string | number | boolean>,
  body?: string,
): unknown {
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
      if (normalized.startsWith("/diskspace")) return DEMO_ARR_DISKSPACE;
      if (normalized.startsWith("/tag")) return [];
      if (normalized.startsWith("/customfilter")) return [];
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      if (normalized.startsWith("/health")) return DEMO_RADARR_HEALTH;
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
      if (normalized.startsWith("/diskspace")) return DEMO_ARR_DISKSPACE;
      if (normalized.startsWith("/tag")) return [];
      if (normalized.startsWith("/customfilter")) return [];
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      if (normalized.startsWith("/health")) return DEMO_SONARR_HEALTH;
      if (normalized.startsWith("/series/lookup")) return [];
      if (normalized.startsWith("/episode")) return [];
      return undefined;
    }
    case "lidarr": {
      if (normalized === "/artist") return DEMO_LIDARR_ARTISTS;
      if (normalized === "/artist/lookup") return [];
      if (normalized === "/artist/:id") {
        const artistId = Number(basePath.split("/").pop());
        return DEMO_LIDARR_ARTISTS.find((a) => a.id === artistId) ?? DEMO_LIDARR_ARTISTS[0];
      }
      if (normalized === "/album/:id") {
        const albumId = Number(basePath.split("/").pop());
        return DEMO_LIDARR_ALBUMS.find((a) => a.id === albumId) ?? DEMO_LIDARR_ALBUMS[0];
      }
      if (normalized === "/album") {
        const artistId = params?.artistId != null ? Number(params.artistId) : null;
        return artistId == null
          ? DEMO_LIDARR_ALBUMS
          : DEMO_LIDARR_ALBUMS.filter((a) => a.artistId === artistId);
      }
      if (normalized.startsWith("/track")) {
        const albumId = params?.albumId != null ? Number(params.albumId) : null;
        return albumId == null
          ? DEMO_LIDARR_TRACKS
          : DEMO_LIDARR_TRACKS.filter((t) => t.albumId === albumId);
      }
      if (normalized.startsWith("/queue")) return DEMO_LIDARR_QUEUE;
      if (normalized.startsWith("/wanted/missing")) return DEMO_LIDARR_WANTED;
      if (normalized.startsWith("/qualityprofile")) return [{ id: 1, name: "Lossless" }, { id: 2, name: "Standard" }];
      if (normalized.startsWith("/metadataprofile")) return [{ id: 1, name: "Standard" }];
      if (normalized.startsWith("/rootfolder")) return [{ id: 1, path: "/music", freeSpace: 2199023255552 }];
      if (normalized.startsWith("/diskspace")) return DEMO_ARR_DISKSPACE;
      if (normalized.startsWith("/tag")) return [];
      if (normalized.startsWith("/system/status")) return DEMO_SYSTEM_STATUS;
      // Lidarr intentionally healthy — exercises the no-badge path.
      if (normalized.startsWith("/health")) return [];
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
      if (normalized.startsWith("/health")) return DEMO_PROWLARR_HEALTH;
      return undefined;
    }
    case "jackett": {
      // The Torznab meta endpoint answers with XML; the JSON results endpoint
      // handles both live search and the indexer-status sidebar.
      if (normalized.startsWith("/indexers/all/results/torznab"))
        return DEMO_JACKETT_INDEXERS_XML;
      if (normalized.startsWith("/indexers/all/results")) return DEMO_JACKETT_RESULTS;
      return undefined;
    }
    case "bazarr": {
      if (normalized.startsWith("/movies/wanted")) return DEMO_BAZARR_WANTED_MOVIES;
      if (normalized.startsWith("/episodes/wanted")) return DEMO_BAZARR_WANTED_EPISODES;
      if (normalized.startsWith("/movies/history")) return DEMO_BAZARR_HISTORY;
      if (normalized.startsWith("/episodes/history")) return DEMO_BAZARR_HISTORY;
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
      if (normalized === "/network") return DEMO_GLANCES_NET;
      if (normalized === "/gpu") return DEMO_GLANCES_GPU;
      if (normalized === "/containers") return DEMO_GLANCES_CONTAINERS;
      return undefined;
    }
    case "qbittorrent": {
      if (normalized === "/transfer/info") return DEMO_QB_TRANSFER_INFO;
      if (normalized.startsWith("/sync/maindata")) return DEMO_QB_MAINDATA;
      if (normalized.startsWith("/torrents/categories")) return DEMO_QB_CATEGORIES;
      if (normalized.startsWith("/torrents/info")) {
        // Honor the `category` query param so the demo category filter works:
        // omitted → all, "" → uncategorized, name → that category.
        const cat = new URLSearchParams(path.split("?")[1] ?? "").get("category");
        return cat === null
          ? DEMO_QB_TORRENTS
          : DEMO_QB_TORRENTS.filter((t) => t.category === cat);
      }
      if (normalized.startsWith("/torrents/files")) return [];
      if (normalized.startsWith("/torrents/trackers")) return [];
      if (normalized.startsWith("/torrents/reannounce")) return {};
      if (normalized.startsWith("/app/version")) return "5.0.0";
      return undefined;
    }
    case "sabnzbd": {
      // SAB hits a single endpoint at /api with mode= as a query param, so
      // the routing key lives in params, not the path.
      const mode = String(params?.mode ?? "queue");
      if (mode === "queue") return DEMO_SAB_QUEUE;
      if (mode === "history") return DEMO_SAB_HISTORY;
      if (mode === "version") return DEMO_SAB_VERSION;
      // pause/resume/addurl all return { status: true }
      return { status: true };
    }
    case "nzbget": {
      // NZBGet dispatches off the JSON-RPC method name carried in the request
      // body, not the path. Wrap the result in the JSON-RPC envelope shape so
      // the api layer's `result` unwrap sees what it expects.
      let method = "version";
      if (body) {
        try {
          const parsed = JSON.parse(body) as { method?: string };
          if (typeof parsed.method === "string") method = parsed.method;
        } catch {
          // fall through to version
        }
      }
      const result =
        method === "listgroups"
          ? DEMO_NZBGET_GROUPS
          : method === "history"
            ? DEMO_NZBGET_HISTORY
            : method === "status"
              ? DEMO_NZBGET_STATUS
              : method === "version"
                ? "21.1"
                : true; // pausedownload, resumedownload, editqueue, append all return bool
      return { version: "1.1", result };
    }
    case "tracearr": {
      if (basePath === "/streams") return DEMO_TRACEARR_STREAMS;
      if (basePath === "/history") return DEMO_TRACEARR_HISTORY;
      return undefined;
    }
    case "rtorrent": {
      // rtorrent dispatches off the XML-RPC methodName in the request body and
      // returns canned XML (the api parses it). system.multicall is used for
      // both the global-stats fan-out and the action acks, distinguished by
      // whether the body references the throttle getters.
      const method = body?.match(/<methodName>([^<]+)<\/methodName>/)?.[1] ?? "";
      if (method === "d.multicall2") return DEMO_RTORRENT_MULTICALL_XML;
      if (method === "system.multicall") {
        return body?.includes("throttle.global_down.rate")
          ? DEMO_RTORRENT_STATS_XML
          : DEMO_RTORRENT_OK_XML;
      }
      // load.start / load.raw_start / scalar setters → trivial OK.
      return DEMO_RTORRENT_SCALAR_OK_XML;
    }
    case "transmission": {
      // Transmission dispatches off the JSON-RPC method name in the request
      // body; the api returns getDemoResponse() verbatim as the `arguments`
      // payload (plain objects, not strings — unlike rtorrent's XML).
      let method = "";
      let ids: unknown;
      try {
        const parsed = body ? (JSON.parse(body) as { method?: string; arguments?: { ids?: unknown } }) : undefined;
        method = parsed?.method ?? "";
        ids = parsed?.arguments?.ids;
      } catch {
        return undefined;
      }
      if (method === "torrent-get") {
        // A detail fetch passes ids:[hash]; narrow so the detail screen gets the
        // matching torrent. No ids → the whole library.
        if (Array.isArray(ids) && ids.length > 0) {
          const wanted = new Set(ids.map((h) => String(h).toLowerCase()));
          return {
            torrents: DEMO_TRANSMISSION_TORRENTS.filter((t) =>
              wanted.has(t.hashString.toLowerCase()),
            ),
          };
        }
        return { torrents: DEMO_TRANSMISSION_TORRENTS };
      }
      if (method === "session-stats") return DEMO_TRANSMISSION_STATS;
      if (method === "session-get") return DEMO_TRANSMISSION_SESSION;
      // session-set / torrent-start / torrent-stop / torrent-remove /
      // torrent-add / torrent-set / torrent-reannounce → empty success ack.
      return {};
    }
    case "unraid": {
      // unRAID is GraphQL — dispatch off the operation name in the POSTed
      // body ({query, variables}); unraid-api.ts unwraps the {data} envelope.
      const query = (() => {
        try {
          return body ? (JSON.parse(body) as { query?: string }).query ?? "" : "";
        } catch {
          return "";
        }
      })();
      if (query.includes("UnraidContainers")) {
        return { data: { docker: { containers: DEMO_UNRAID_CONTAINERS } } };
      }
      if (query.includes("UnraidStorage")) {
        return { data: { array: DEMO_UNRAID_ARRAY, disks: DEMO_UNRAID_DISKS } };
      }
      for (const [op, field] of [
        ["StartContainer", "start"],
        ["StopContainer", "stop"],
        ["RestartContainer", "restart"],
      ] as const) {
        if (query.includes(op)) {
          const state = field === "stop" ? "EXITED" : "RUNNING";
          const status = field === "stop" ? "Exited (0) 1 second ago" : "Up 1 second";
          return { data: { docker: { [field]: { id: "c1", state, status } } } };
        }
      }
      return undefined;
    }
    // Emby shares Jellyfin's API surface, so it reuses the same demo payloads.
    case "emby":
    case "jellyfin": {
      if (basePath === "/System/Info/Public")
        return { Version: "10.8.13", ServerName: serviceId === "emby" ? "Demo Emby" : "Demo Jellyfin" };
      if (basePath === "/Users/Me") return DEMO_JELLYFIN_ME;
      if (basePath === "/Users") return DEMO_JELLYFIN_USERS;
      if (basePath === "/Sessions") return DEMO_JELLYFIN_SESSIONS;
      if (basePath.endsWith("/Views")) return DEMO_JELLYFIN_VIEWS;
      if (basePath.endsWith("/Items/Latest")) return DEMO_JELLYFIN_LATEST;
      if (basePath.endsWith("/Items/Resume")) return DEMO_JELLYFIN_RESUME;
      return undefined;
    }
    default:
      return undefined;
  }
}

// 30-day play history with a deterministic weekend-heavy pattern (no RNG so the
// demo charts look identical every launch). time_range is ignored in demo.
const DEMO_TAUTULLI_PLAYS_BY_DATE = (() => {
  const categories: string[] = [];
  const tv: number[] = [];
  const movies: number[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    categories.push(d.toISOString().slice(0, 10));
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    tv.push((weekend ? 6 : 2) + (i % 3));
    movies.push((weekend ? 4 : 1) + (i % 2));
  }
  return { categories, series: [{ name: "TV", data: tv }, { name: "Movies", data: movies }] };
})();

const DEMO_TAUTULLI_PLAYS_BY_DOW = {
  categories: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  series: [
    { name: "TV", data: [9, 7, 8, 10, 13, 22, 19] },
    { name: "Movies", data: [3, 2, 3, 4, 6, 14, 12] },
  ],
};

const DEMO_TAUTULLI_PLAYS_BY_HOD = {
  categories: Array.from({ length: 24 }, (_, h) => String(h)),
  series: [
    {
      name: "TV",
      data: [1, 0, 0, 0, 0, 0, 1, 3, 4, 3, 2, 3, 5, 4, 3, 4, 6, 9, 14, 18, 22, 17, 9, 4],
    },
    {
      name: "Movies",
      data: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1, 2, 3, 2, 2, 3, 4, 6, 10, 13, 16, 12, 6, 2],
    },
  ],
};

const DEMO_TAUTULLI_HOME_STATS = [
  {
    stat_id: "top_users",
    stat_title: "Most Active Users",
    rows: [
      { friendly_name: "john_smith", user: "john_smith", total_plays: 142, total_duration: 512000 },
      { friendly_name: "sarah_c", user: "sarah_c", total_plays: 98, total_duration: 333000 },
      { friendly_name: "mike_d", user: "mike_d", total_plays: 51, total_duration: 180400 },
      { friendly_name: "emma_w", user: "emma_w", total_plays: 23, total_duration: 88000 },
    ],
  },
];

export function getDemoTautulliResponse(cmd: string): unknown {
  switch (cmd) {
    case "get_activity": return DEMO_TAUTULLI_ACTIVITY;
    case "get_history": return DEMO_TAUTULLI_HISTORY;
    case "get_libraries_table": return DEMO_TAUTULLI_LIBRARIES;
    case "get_server_identity": return DEMO_TAUTULLI_SERVER_IDENTITY;
    case "get_plays_by_date": return DEMO_TAUTULLI_PLAYS_BY_DATE;
    case "get_plays_by_dayofweek": return DEMO_TAUTULLI_PLAYS_BY_DOW;
    case "get_plays_by_hourofday": return DEMO_TAUTULLI_PLAYS_BY_HOD;
    case "get_home_stats": return DEMO_TAUTULLI_HOME_STATS;
    default: return undefined;
  }
}

// --- JellyStat demo data ---
// JellyStat-shaped equivalents of the Tautulli demo set, so demo mode shows the
// Activity history + JellyStat stats screen populated. Deterministic (no RNG)
// so screenshots look identical every launch. `count` is sent as a string to
// mirror node-postgres bigint serialization (callers coerce with Number()).
const DEMO_JELLYSTAT_LIBRARIES = [
  { Id: "lib-movies", Name: "Movies" },
  { Id: "lib-shows", Name: "Shows" },
];

const DEMO_JELLYSTAT_VIEWS_OVER_TIME = (() => {
  const stats = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const key = d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "2-digit" });
    stats.push({
      Key: key,
      Movies: { count: String((weekend ? 4 : 1) + (i % 2)), duration: (weekend ? 4 : 1) * 95 },
      Shows: { count: String((weekend ? 6 : 2) + (i % 3)), duration: (weekend ? 6 : 2) * 42 },
    });
  }
  return { libraries: DEMO_JELLYSTAT_LIBRARIES, stats };
})();

const DEMO_JELLYSTAT_VIEWS_BY_DAYS = {
  libraries: DEMO_JELLYSTAT_LIBRARIES,
  stats: [
    { Key: "Sunday", Movies: { count: "12" }, Shows: { count: "19" } },
    { Key: "Monday", Movies: { count: "3" }, Shows: { count: "9" } },
    { Key: "Tuesday", Movies: { count: "2" }, Shows: { count: "7" } },
    { Key: "Wednesday", Movies: { count: "3" }, Shows: { count: "8" } },
    { Key: "Thursday", Movies: { count: "4" }, Shows: { count: "10" } },
    { Key: "Friday", Movies: { count: "6" }, Shows: { count: "13" } },
    { Key: "Saturday", Movies: { count: "14" }, Shows: { count: "22" } },
  ],
};

const DEMO_JELLYSTAT_VIEWS_BY_HOUR = (() => {
  const tv = [1, 0, 0, 0, 0, 0, 1, 3, 4, 3, 2, 3, 5, 4, 3, 4, 6, 9, 14, 18, 22, 17, 9, 4];
  const mv = [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1, 2, 3, 2, 2, 3, 4, 6, 10, 13, 16, 12, 6, 2];
  return {
    libraries: DEMO_JELLYSTAT_LIBRARIES,
    stats: Array.from({ length: 24 }, (_, h) => ({
      Key: h,
      Movies: { count: String(mv[h]) },
      Shows: { count: String(tv[h]) },
    })),
  };
})();

const DEMO_JELLYSTAT_ACTIVE_USERS = [
  { Plays: "142", UserId: "u1", Name: "john_smith" },
  { Plays: "98", UserId: "u2", Name: "sarah_c" },
  { Plays: "51", UserId: "u3", Name: "mike_d" },
  { Plays: "23", UserId: "u4", Name: "emma_w" },
];

const DEMO_JELLYSTAT_PLAYBACK_ACTIVITY = {
  current_page: 1,
  pages: 1,
  size: 30,
  sort: "ActivityDateInserted",
  desc: true,
  results: [
    {
      Id: "js-1",
      UserName: "john_smith",
      NowPlayingItemName: "The Pilot",
      SeriesName: "Stranger Things",
      EpisodeId: "ep-1",
      Client: "Jellyfin Android",
      DeviceName: "Pixel 8",
      PlayMethod: "DirectPlay",
      PlaybackDuration: "2820",
      ActivityDateInserted: new Date(Date.now() - 3 * 3600000).toISOString(),
    },
    {
      Id: "js-2",
      UserName: "sarah_c",
      NowPlayingItemName: "Dune: Part Two",
      Client: "Jellyfin Web",
      DeviceName: "Chrome",
      PlayMethod: "Transcode",
      PlaybackDuration: "9600",
      ActivityDateInserted: new Date(Date.now() - 26 * 3600000).toISOString(),
    },
    {
      Id: "js-3",
      UserName: "mike_d",
      NowPlayingItemName: "Chapter Two",
      SeriesName: "The Bear",
      EpisodeId: "ep-2",
      Client: "Jellyfin tvOS",
      DeviceName: "Living Room Apple TV",
      PlayMethod: "DirectPlay",
      PlaybackDuration: "1860",
      ActivityDateInserted: new Date(Date.now() - 50 * 3600000).toISOString(),
    },
  ],
};

export function getDemoJellystatResponse(path: string): unknown {
  const basePath = path.split("?")[0]!;
  switch (basePath) {
    case "/proxy/getSessions": return [];
    case "/stats/getPlaybackActivity": return DEMO_JELLYSTAT_PLAYBACK_ACTIVITY;
    case "/stats/getViewsOverTime": return DEMO_JELLYSTAT_VIEWS_OVER_TIME;
    case "/stats/getViewsByDays": return DEMO_JELLYSTAT_VIEWS_BY_DAYS;
    case "/stats/getViewsByHour": return DEMO_JELLYSTAT_VIEWS_BY_HOUR;
    case "/stats/getMostActiveUsers": return DEMO_JELLYSTAT_ACTIVE_USERS;
    case "/stats/getLibraryOverview": return DEMO_JELLYSTAT_LIBRARIES;
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
