// --- qBittorrent Types ---

export interface QBTransferInfo {
  dl_info_speed: number;
  dl_info_data: number;
  up_info_speed: number;
  up_info_data: number;
  dl_rate_limit: number;
  up_rate_limit: number;
  dht_nodes: number;
  connection_status: "connected" | "firewalled" | "disconnected";
}

// Subset of qBittorrent's /sync/maindata `server_state` we care about. Unlike
// /transfer/info — which only exposes per-session counters (`*_info_data`)
// that reset on every qBit restart — server_state also carries lifetime
// totals (`alltime_dl`, `alltime_ul`). The Speed Stats widget uses the
// lifetime values so the dashboard "X GB total" persists across restarts;
// see #104. The endpoint returns many more fields (free disk, ratio, etc.)
// that we omit until something else needs them.
export interface QBServerState {
  alltime_dl: number;
  alltime_ul: number;
  dl_info_speed: number;
  dl_info_data: number;
  up_info_speed: number;
  up_info_data: number;
  connection_status: "connected" | "firewalled" | "disconnected";
}

// qBittorrent 5.0 renamed `pausedUP`/`pausedDL` to `stoppedUP`/`stoppedDL`.
// Both are kept here so the app works against 4.x and 5.x servers.
export type TorrentState =
  | "error"
  | "missingFiles"
  | "uploading"
  | "pausedUP"
  | "stoppedUP"
  | "queuedUP"
  | "stalledUP"
  | "checkingUP"
  | "forcedUP"
  | "allocating"
  | "downloading"
  | "metaDL"
  | "pausedDL"
  | "stoppedDL"
  | "queuedDL"
  | "stalledDL"
  | "checkingDL"
  | "forcedDL"
  | "checkingResumeData"
  | "moving"
  | "unknown";

export function isTorrentPaused(state: TorrentState): boolean {
  return (
    state === "pausedUP" ||
    state === "pausedDL" ||
    state === "stoppedUP" ||
    state === "stoppedDL"
  );
}

export interface QBTorrent {
  hash: string;
  name: string;
  size: number;
  progress: number;
  dlspeed: number;
  upspeed: number;
  priority: number;
  num_seeds: number;
  num_leechs: number;
  ratio: number;
  // Per-torrent share limits from /torrents/info, sharing the setShareLimits
  // sentinels: -2 = use global limit, -1 = no limit. seeding_time_limit is in
  // minutes. (Elapsed seeding_time, by contrast, is reported in seconds.)
  ratio_limit: number;
  seeding_time_limit: number;
  eta: number;
  state: TorrentState;
  category: string;
  tags: string;
  added_on: number;
  completion_on: number;
  save_path: string;
  content_path: string;
  amount_left: number;
  completed: number;
  downloaded: number;
  uploaded: number;
}

export interface QBTorrentFile {
  index: number;
  name: string;
  size: number;
  progress: number;
  priority: number;
  is_seed: boolean;
}

export interface QBTorrentTracker {
  url: string;
  status: number;
  tier: number;
  num_peers: number;
  num_seeds: number;
  num_leeches: number;
  msg: string;
}

// --- SABnzbd Types ---

export type SabSlotStatus =
  | "Queued"
  | "Paused"
  | "Downloading"
  | "Grabbing"
  | "Fetching"
  | "Checking"
  | "Verifying"
  | "Repairing"
  | "Extracting"
  | "Moving"
  | "Completed"
  | "Failed";

export interface SabQueueSlot {
  nzo_id: string;
  filename: string;
  cat: string;
  status: SabSlotStatus;
  priority: string;
  // SAB returns most numeric fields as strings — keep them as the API does
  // and parse at the call site so types match the wire format exactly.
  mb: string;
  mbleft: string;
  size: string;
  sizeleft: string;
  percentage: string;
  timeleft: string;
  index: number;
}

export interface SabQueue {
  paused: boolean;
  speed: string;
  speedlimit: string;
  size: string;
  sizeleft: string;
  noofslots: number;
  noofslots_total: number;
  diskspace1: string;
  diskspace2: string;
  status: "Idle" | "Paused" | "Downloading";
  kbpersec: string;
  slots: SabQueueSlot[];
}

export interface SabHistorySlot {
  nzo_id: string;
  name: string;
  category: string;
  status: "Completed" | "Failed";
  fail_message: string;
  size: string;
  bytes: number;
  download_time: number;
  completed: number;
  storage: string;
}

export interface SabHistory {
  slots: SabHistorySlot[];
  total_size: string;
  noofslots: number;
}

// --- NZBGet ---
// NZBGet's JSON-RPC returns 64-bit byte counts as Lo/Hi pairs. Use
// combineHiLo() from lib/utils.ts to reassemble.

// Status strings the queue ("listgroups") returns. `Status` is what NZBGet
// actually emits — see https://nzbget.net/api/listgroups
export type NzbgetGroupStatus =
  | "QUEUED"
  | "PAUSED"
  | "DOWNLOADING"
  | "FETCHING"
  | "PARSING"
  | "REPAIRING"
  | "UNPACKING"
  | "MOVING"
  | "VERIFYING"
  | "RENAMING"
  | "DELETING"
  | "PP_QUEUED";

export interface NzbgetGroup {
  NZBID: number;
  NZBName: string;
  Kind: "NZB" | "URL";
  Category: string;
  Status: NzbgetGroupStatus;
  Priority: number;
  Health: number;
  // Sizes in bytes via Lo/Hi split.
  FileSizeLo: number;
  FileSizeHi: number;
  RemainingSizeLo: number;
  RemainingSizeHi: number;
  DownloadedSizeLo: number;
  DownloadedSizeHi: number;
  // Per-group download rate is the queue average for that group; the overall
  // rate lives in the `status` call.
  DownloadRate?: number;
}

export type NzbgetHistoryStatus =
  // Top-level status from history items. NZBGet's actual `Status` field is a
  // composite like "SUCCESS/ALL", "FAILURE/PAR", "WARNING/HEALTH" etc., but
  // the prefix before the slash is enough for our completion classification.
  | "SUCCESS"
  | "FAILURE"
  | "WARNING"
  | "DELETED"
  | "NONE";

export interface NzbgetHistoryItem {
  NZBID: number;
  NZBName: string;
  Category: string;
  Status: string; // raw composite "SUCCESS/ALL" etc.
  HistoryTime: number; // unix seconds
  FileSizeLo: number;
  FileSizeHi: number;
  DownloadedSizeLo: number;
  DownloadedSizeHi: number;
  ParStatus?: string;
  ScriptStatus?: string;
  Kind?: string;
}

export interface NzbgetStatus {
  RemainingSizeLo: number;
  RemainingSizeHi: number;
  DownloadRate: number; // bytes/sec
  AverageDownloadRate: number;
  DownloadLimit: number; // bytes/sec, 0 = unlimited
  ServerStandBy: boolean;
  DownloadPaused: boolean;
  Download2Paused: boolean;
  ServerPaused: boolean;
  PostPaused: boolean;
  ScanPaused: boolean;
  FreeDiskSpaceLo: number;
  FreeDiskSpaceHi: number;
  UpTimeSec: number;
  DownloadTimeSec: number;
  ThreadCount: number;
  ResumeTime: number;
  FeedActive: boolean;
}

// Subset of qBittorrent /app/preferences. All limits are bytes/s; 0 = unlimited.
export interface QBSpeedPreferences {
  dl_limit: number;
  up_limit: number;
  alt_dl_limit: number;
  alt_up_limit: number;
}

// --- Shared Media Info ---

export interface MediaInfo {
  audioChannels: number;
  audioCodec: string;
  audioLanguages?: string;
  videoCodec: string;
  videoDynamicRange: string;
  videoDynamicRangeType: string;
  resolution: string;
  videoBitDepth?: number;
}

// --- Radarr Types ---

export interface RadarrMovieFile {
  id: number;
  movieId: number;
  relativePath: string;
  size: number;
  quality: { quality: { name: string } };
  mediaInfo?: MediaInfo;
}

export interface RadarrMovie {
  id: number;
  title: string;
  sortTitle: string;
  year: number;
  tmdbId: number;
  imdbId?: string;
  overview: string;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  status: string;
  added: string;
  inCinemas?: string;
  physicalRelease?: string;
  digitalRelease?: string;
  // Computed by the server from minimumAvailability (Radarr >= 5.10, Aug 2024)
  releaseDate?: string;
  // "tba" | "announced" | "inCinemas" | "released"
  minimumAvailability?: string;
  sizeOnDisk: number;
  images: RadarrImage[];
  ratings: RatingsBundle;
  runtime: number;
  qualityProfileId: number;
  rootFolderPath: string;
  movieFile?: RadarrMovieFile;
  genres?: string[];
  tags?: number[];
  certification?: string;
  studio?: string;
}

export interface RatingChild {
  votes?: number;
  value?: number;
  type?: string;
}

// Radarr/Sonarr v3+ return ratings as a bundle of named sources. Older builds
// returned a flat `{ votes, value }` — kept as optional for back-compat.
export interface RatingsBundle {
  imdb?: RatingChild;
  tmdb?: RatingChild;
  metacritic?: RatingChild;
  rottenTomatoes?: RatingChild;
  votes?: number;
  value?: number;
}

export interface RadarrImage {
  coverType: "poster" | "banner" | "fanart";
  url: string;
  remoteUrl: string;
}

export interface RadarrQueueItem {
  id: number;
  movieId: number;
  title: string;
  status: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  statusMessages: { title: string; messages: string[] }[];
  size: number;
  sizeleft: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  protocol: string;
  downloadId?: string;
  downloadClient?: string;
  quality: { quality: { name: string } };
  movie?: RadarrMovie;
}

export interface RadarrQueue {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: RadarrQueueItem[];
}

export interface RadarrHistoryRecord {
  id: number;
  eventType: string;
  sourceTitle?: string;
  date?: string;
  downloadId?: string;
  movieId?: number;
  movie?: RadarrMovie;
}

export interface RadarrHistory {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: RadarrHistoryRecord[];
}

export interface RadarrWantedMissing {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: RadarrMovie[];
}

export interface RadarrSearchResult {
  tmdbId: number;
  title: string;
  year: number;
  overview: string;
  images: RadarrImage[];
  ratings: { votes: number; value: number };
  runtime: number;
}

// --- Interactive search (releases) ---

// Shape returned by Radarr/Sonarr `/release` for interactive search. Most
// fields are identical across the two — Sonarr just adds episode/season
// mapping data. Both expose seeders/leechers only for torrent results.
export interface ArrRelease {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  size: number;
  age: number;
  ageHours: number;
  ageMinutes?: number;
  publishDate: string;
  quality: {
    quality: { id: number; name: string; source?: string; resolution?: number };
    revision?: { version?: number; real?: number; isRepack?: boolean };
  };
  languages?: { id: number; name: string }[];
  protocol: "torrent" | "usenet" | "unknown";
  seeders?: number;
  leechers?: number;
  customFormatScore?: number;
  rejected: boolean;
  rejections?: string[];
  downloadUrl?: string;
  magnetUrl?: string;
  infoUrl?: string;
  releaseGroup?: string;
}

export interface RadarrRelease extends ArrRelease {
  // Radarr returns this on `/release`; it's only typed so a saved custom filter
  // keyed on `movieRequested` can be evaluated (see lib/arr-custom-filters.ts).
  movieRequested?: boolean;
}

export interface SonarrRelease extends ArrRelease {
  mappedSeasonNumber?: number;
  mappedEpisodeNumbers?: number[];
  fullSeason?: boolean;
  isAbsoluteNumbering?: boolean;
  isDaily?: boolean;
  episodeRequested?: boolean;
}

// --- *arr saved custom filters (interactive search) ---

// `GET /api/v3/customfilter` returns these. They are stored server-side but
// evaluated entirely client-side by the *arr web app — Dashboarr re-implements
// that engine in lib/arr-custom-filters.ts. `type` is the "section"; for
// interactive search it is "releases". Each clause's `type` is the operator
// (defaults to "equal"); `value` is a scalar or an array.
export interface ArrFilterClause {
  key: string;
  value: unknown;
  type?: string;
}

export interface ArrCustomFilter {
  id: number;
  type: string;
  label: string;
  filters: ArrFilterClause[];
}

// --- *arr disk space (identical payload on Radarr v3, Sonarr v3, Lidarr v1) ---

// `GET /diskspace` returns one entry per mount the *arr process can see — the
// System → Status disk table. Powers the Disk Space dashboard widget.
export interface ArrDiskSpace {
  path: string; // mount path, e.g. "/data"
  label: string; // display label; often equals path, may be "" on some platforms
  freeSpace: number; // bytes
  totalSpace: number; // bytes
}

// --- Sonarr Types ---

export type SonarrSeriesType = "standard" | "daily" | "anime";

export interface SonarrSeries {
  id: number;
  title: string;
  sortTitle: string;
  seasonCount: number;
  totalEpisodeCount: number;
  episodeCount: number;
  episodeFileCount: number;
  sizeOnDisk: number;
  status: string;
  overview: string;
  network: string;
  year: number;
  tvdbId: number;
  imdbId?: string;
  monitored: boolean;
  added: string;
  images: SonarrImage[];
  seasons: SonarrSeason[];
  qualityProfileId: number;
  rootFolderPath: string;
  seriesType: SonarrSeriesType;
  seasonFolder: boolean;
  // "Monitor New Seasons" — Sonarr v4+; absent on older v3 servers.
  monitorNewItems?: "all" | "none";
  ratings?: RatingsBundle;
  genres?: string[];
  tags?: number[];
  certification?: string;
  firstAired?: string;
  nextAiring?: string;
  previousAiring?: string;
  statistics?: {
    seasonCount: number;
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrImage {
  coverType: "poster" | "banner" | "fanart";
  url: string;
  remoteUrl: string;
}

export interface SonarrEpisodeFile {
  id: number;
  seriesId: number;
  seasonNumber: number;
  relativePath: string;
  size: number;
  quality: { quality: { name: string } };
  mediaInfo?: MediaInfo;
}

export interface SonarrSeason {
  seasonNumber: number;
  monitored: boolean;
  statistics?: {
    episodeFileCount: number;
    episodeCount: number;
    totalEpisodeCount: number;
    sizeOnDisk: number;
    percentOfEpisodes: number;
  };
}

export interface SonarrEpisode {
  id: number;
  seriesId: number;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  airDate?: string;
  airDateUtc?: string;
  overview?: string;
  hasFile: boolean;
  monitored: boolean;
  series?: SonarrSeries;
  episodeFileId?: number;
  episodeFile?: SonarrEpisodeFile;
}

export interface SonarrCalendarEntry {
  id: number;
  seriesId: number;
  episodeNumber: number;
  seasonNumber: number;
  title: string;
  airDate: string;
  airDateUtc: string;
  hasFile: boolean;
  monitored: boolean;
  series: SonarrSeries;
}

export interface SonarrQueueItem {
  id: number;
  seriesId: number;
  episodeId: number;
  title: string;
  status: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  protocol: string;
  downloadId?: string;
  quality: { quality: { name: string } };
  series?: SonarrSeries;
  episode?: SonarrEpisode;
}

export interface SonarrQueue {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: SonarrQueueItem[];
}

// Paged /wanted/missing response — aired, monitored episodes without a file.
// Fetched with includeSeries=true so each record carries its series.
export interface SonarrWantedMissing {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: SonarrEpisode[];
}

export interface SonarrHistoryRecord {
  id: number;
  eventType: string;
  sourceTitle?: string;
  date?: string;
  downloadId?: string;
  seriesId?: number;
  episodeId?: number;
  series?: SonarrSeries;
  episode?: SonarrEpisode;
}

export interface SonarrHistory {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: SonarrHistoryRecord[];
}

export interface SonarrSearchResult {
  tvdbId: number;
  title: string;
  year: number;
  overview: string;
  images: SonarrImage[];
  seasonCount: number;
  network: string;
}

// --- Lidarr Types ---
// Lidarr is an *arr sibling on the v1 API. Artists map to Radarr movies /
// Sonarr series (the monitored library entity); albums map to seasons (the
// child entity with their own monitor + search). Artist covers use coverType
// "poster"; album covers use "cover".

export interface LidarrImage {
  coverType:
    | "poster"
    | "banner"
    | "fanart"
    | "cover"
    | "disc"
    | "logo"
    | "headshot";
  url: string;
  remoteUrl: string;
}

export interface LidarrArtistStatistics {
  albumCount?: number;
  trackFileCount: number;
  trackCount: number;
  totalTrackCount: number;
  sizeOnDisk: number;
  percentOfTracks?: number;
}

export interface LidarrAlbumStatistics {
  trackFileCount: number;
  trackCount: number;
  totalTrackCount: number;
  sizeOnDisk: number;
  percentOfTracks?: number;
}

export interface LidarrArtist {
  id: number;
  artistName: string;
  foreignArtistId: string;
  mbId?: string;
  sortName?: string;
  overview?: string;
  artistType?: string;
  disambiguation?: string;
  // "continuing" | "ended" — drives the corner ribbon like Sonarr's series.
  status: string;
  ended?: boolean;
  monitored: boolean;
  qualityProfileId: number;
  metadataProfileId: number;
  rootFolderPath?: string;
  path?: string;
  genres?: string[];
  images: LidarrImage[];
  ratings?: RatingsBundle;
  added: string;
  tags?: number[];
  statistics?: LidarrArtistStatistics;
}

export interface LidarrAlbum {
  id: number;
  title: string;
  disambiguation?: string;
  overview?: string;
  artistId: number;
  foreignAlbumId: string;
  monitored: boolean;
  albumType: string;
  secondaryTypes?: string[];
  releaseDate?: string;
  genres?: string[];
  images: LidarrImage[];
  ratings?: RatingsBundle;
  duration?: number;
  mediumCount?: number;
  // Present on the wanted/missing + queue payloads (Lidarr nests the parent
  // artist) so screens can resolve the artist without a second fetch.
  artist?: LidarrArtist;
  statistics?: LidarrAlbumStatistics;
}

export interface LidarrTrack {
  id: number;
  title: string;
  trackNumber?: string;
  absoluteTrackNumber?: number;
  duration?: number;
  mediumNumber?: number;
  hasFile: boolean;
  trackFileId?: number;
  albumId: number;
  artistId: number;
}

export interface LidarrQueueItem {
  id: number;
  artistId?: number;
  albumId?: number;
  title: string;
  status: string;
  trackedDownloadStatus?: string;
  trackedDownloadState?: string;
  statusMessages?: { title: string; messages: string[] }[];
  size: number;
  sizeleft: number;
  timeleft?: string;
  estimatedCompletionTime?: string;
  protocol: string;
  downloadId?: string;
  downloadClient?: string;
  quality: { quality: { name: string } };
  artist?: LidarrArtist;
  album?: LidarrAlbum;
}

export interface LidarrQueue {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: LidarrQueueItem[];
}

export interface LidarrWantedMissing {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: LidarrAlbum[];
}

export interface LidarrArtistSearchResult {
  foreignArtistId: string;
  artistName: string;
  overview?: string;
  artistType?: string;
  disambiguation?: string;
  status?: string;
  images: LidarrImage[];
  genres?: string[];
  ratings?: RatingsBundle;
  remotePoster?: string;
}

// --- Overseerr Types ---

export type OverseerrMediaType = "movie" | "tv";

export type OverseerrMediaStatus =
  | 1 // UNKNOWN
  | 2 // PENDING
  | 3 // PROCESSING
  | 4 // PARTIALLY_AVAILABLE
  | 5; // AVAILABLE

export const OVERSEERR_STATUS_LABELS: Record<number, string> = {
  1: "Unknown",
  2: "Pending",
  3: "Processing",
  4: "Partial",
  5: "Available",
};

export interface OverseerrRequest {
  id: number;
  status: number; // 1=pending, 2=approved, 3=declined
  media: {
    id: number;
    mediaType: OverseerrMediaType;
    tmdbId: number;
    tvdbId?: number;
    status: OverseerrMediaStatus;
    createdAt: string;
    updatedAt: string;
  };
  createdAt: string;
  updatedAt: string;
  requestedBy: {
    id: number;
    displayName: string;
    avatar?: string;
  };
  modifiedBy?: {
    id: number;
    displayName: string;
  };
}

export interface OverseerrRequestsResponse {
  pageInfo: {
    pages: number;
    pageSize: number;
    results: number;
    page: number;
  };
  results: OverseerrRequest[];
}

export interface OverseerrMediaResult {
  id: number;
  mediaType: OverseerrMediaType;
  title?: string; // movies
  name?: string; // tv
  overview: string;
  posterPath?: string;
  backdropPath?: string;
  releaseDate?: string;
  firstAirDate?: string;
  voteAverage: number;
  mediaInfo?: {
    status: OverseerrMediaStatus;
    // 4K availability is tracked separately from the regular status. Present in
    // real responses (Media entity has both columns) even though the published
    // OpenAPI spec omits it.
    status4k?: OverseerrMediaStatus;
  };
}

export interface OverseerrSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: OverseerrMediaResult[];
}

// One entry from /discover/genreslider/{movie,tv}: a genre plus a few backdrop
// paths used to illustrate the genre tile.
export interface OverseerrGenreSliderItem {
  id: number;
  name: string;
  backdrops: string[];
}

// A YouTube (or other site) video attached to a TMDB title — trailers, teasers,
// clips, etc. Shape per Overseerr's RelatedVideo schema.
export interface OverseerrRelatedVideo {
  url: string;
  key: string;
  name: string;
  size?: number;
  type:
    | "Clip"
    | "Teaser"
    | "Trailer"
    | "Featurette"
    | "Opening Credits"
    | "Behind the Scenes"
    | "Bloopers";
  site: string; // "YouTube"
}

export interface OverseerrMovieDetails {
  id: number;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  relatedVideos?: OverseerrRelatedVideo[];
  mediaInfo?: {
    id: number;
    status: OverseerrMediaStatus;
    status4k?: OverseerrMediaStatus;
  };
}

export interface OverseerrSeasonInfo {
  id: number;
  seasonNumber: number;
  episodeCount: number;
  name?: string;
  airDate?: string;
}

export interface OverseerrTVDetails {
  id: number;
  name: string;
  posterPath?: string;
  firstAirDate?: string;
  seasons?: OverseerrSeasonInfo[];
  relatedVideos?: OverseerrRelatedVideo[];
  mediaInfo?: {
    id: number;
    status: OverseerrMediaStatus;
    status4k?: OverseerrMediaStatus;
  };
}

// --- Overseerr Service Discovery (Radarr/Sonarr instances configured in Seerr) ---

export interface OverseerrServerInfo {
  id: number;
  name: string;
  is4k: boolean;
  isDefault: boolean;
  activeDirectory: string;
  activeProfileId: number;
  activeTags: number[];
}

export interface OverseerrProfile {
  id: number;
  name: string;
}

export interface OverseerrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
  totalSpace: number;
}

export interface OverseerrTag {
  id: number;
  label: string;
}

export interface OverseerrServerDetails {
  server: OverseerrServerInfo;
  profiles: OverseerrProfile[];
  rootFolders: OverseerrRootFolder[];
  tags: OverseerrTag[];
}

export interface OverseerrTrendingResult extends OverseerrMediaResult {}

export interface OverseerrRequestCount {
  total: number;
  movie: number;
  tv: number;
  pending: number;
  approved: number;
  declined: number;
  processing: number;
  available: number;
}

// --- Overseerr Discover Customization (settings/discover sliders) ---

// Seerr's DiscoverSliderType enum (1-indexed). Kept as a const map + union
// rather than a TS enum so values stay plain numbers and we can reverse-map for
// labels. Mirrors server/constants/discover.ts in Overseerr/Jellyseerr.
export const DiscoverSliderType = {
  RECENTLY_ADDED: 1,
  RECENT_REQUESTS: 2,
  PLEX_WATCHLIST: 3,
  TRENDING: 4,
  POPULAR_MOVIES: 5,
  MOVIE_GENRES: 6,
  UPCOMING_MOVIES: 7,
  STUDIOS: 8,
  POPULAR_TV: 9,
  TV_GENRES: 10,
  UPCOMING_TV: 11,
  NETWORKS: 12,
  TMDB_MOVIE_KEYWORD: 13,
  TMDB_MOVIE_GENRE: 14,
  TMDB_TV_KEYWORD: 15,
  TMDB_TV_GENRE: 16,
  TMDB_SEARCH: 17,
  TMDB_STUDIO: 18,
  TMDB_NETWORK: 19,
  TMDB_MOVIE_STREAMING_SERVICES: 20,
  TMDB_TV_STREAMING_SERVICES: 21,
} as const;

export type DiscoverSliderTypeValue =
  (typeof DiscoverSliderType)[keyof typeof DiscoverSliderType];

// One entry from GET /settings/discover. Built-in sliders have isBuiltIn:true
// and null title/data (rendered by their type). Custom sliders have
// isBuiltIn:false, a user title, and a `data` payload — a TMDB id (keyword /
// genre / company / network / watch-provider) or a free-text query for
// TMDB_SEARCH.
export interface DiscoverSlider {
  id: number;
  type: DiscoverSliderTypeValue;
  order: number;
  isBuiltIn: boolean;
  enabled: boolean;
  title: string | null;
  data: string | null;
}

// One entry in the POST /settings/discover body. The full array is sent in the
// desired display order; the server derives each slider's `order` from its array
// index (any `order` field in the body is ignored), so we omit it. `id` matches
// an existing slider (update) or, when absent/0, creates a new custom slider.
export type DiscoverSliderInput = Pick<
  DiscoverSlider,
  "id" | "type" | "enabled" | "title" | "data"
>;

// POST /settings/discover/add and PUT /settings/discover/{id} body.
export interface DiscoverSliderCreate {
  title: string;
  type: DiscoverSliderTypeValue;
  data: string;
}

// --- Tautulli Types ---

export interface TautulliActivity {
  stream_count: string;
  stream_count_direct_play: number;
  stream_count_direct_stream: number;
  stream_count_transcode: number;
  total_bandwidth: number;
  wan_bandwidth: number;
  lan_bandwidth: number;
  sessions: TautulliSession[];
}

export interface TautulliSession {
  session_key: string;
  session_id: string;
  media_type: "movie" | "episode" | "track";
  title: string;
  parent_title: string; // show name for episodes
  grandparent_title: string; // show name for episodes
  full_title: string;
  year: string;
  rating_key: string;
  parent_rating_key: string;
  grandparent_rating_key: string;
  thumb: string;
  parent_thumb: string;
  grandparent_thumb: string;
  state: "playing" | "paused" | "buffering";
  progress_percent: string;
  transcode_decision: "direct play" | "copy" | "transcode";
  video_resolution: string;
  stream_video_resolution: string;
  bandwidth: string;
  quality_profile: string;
  user: string;
  player: string;
  platform: string;
  product: string;
  duration: string;
  view_offset: string;
  ip_address: string;
  // --- Per-track transcode detail (get_activity returns all of these). ---
  // Decisions are "direct play" | "copy" (direct stream) | "transcode";
  // subtitle may also be "burn". Empty string when not applicable.
  video_decision: string;
  audio_decision: string;
  subtitle_decision: string;
  // Source codecs/resolution/channels vs. what's actually being streamed.
  video_codec: string;
  stream_video_codec: string;
  video_full_resolution: string;
  stream_video_full_resolution: string;
  audio_codec: string;
  stream_audio_codec: string;
  audio_channel_layout: string;
  stream_audio_channel_layout: string;
  subtitle_codec: string;
  subtitle_language: string;
  container: string;
  stream_container: string;
  // Bitrates are kbps as strings ("0"/"" when unknown).
  bitrate: string;
  stream_bitrate: string;
  video_bitrate: string;
  stream_video_bitrate: string;
  audio_bitrate: string;
  stream_audio_bitrate: string;
}

export interface TautulliHistoryItem {
  reference_id: number;
  row_id: number;
  id: number;
  date: number;
  started: number;
  stopped: number;
  duration: number;
  paused_counter: number;
  user: string;
  friendly_name: string;
  platform: string;
  player: string;
  full_title: string;
  title: string;
  parent_title: string;
  grandparent_title: string;
  year: number;
  media_type: "movie" | "episode" | "track";
  thumb: string;
  percent_complete: number;
  watched_status: number;
}

export interface TautulliHistoryResponse {
  response: {
    result: string;
    data: {
      draw: number;
      recordsTotal: number;
      recordsFiltered: number;
      data: TautulliHistoryItem[];
    };
  };
}

export interface TautulliLibraryStats {
  response: {
    result: string;
    data: {
      section_id: number;
      section_name: string;
      section_type: string;
      count: string;
      parent_count?: string;
      child_count?: string;
    }[];
  };
}

// Shared shape returned by Tautulli's get_plays_by_* chart endpoints: one
// `categories` axis (dates / weekdays / hours) and one series per media type.
export interface TautulliPlaysChart {
  categories: string[];
  series: { name: string; data: number[] }[];
}

// One row inside a get_home_stats group (e.g. a top user or top item).
export interface TautulliHomeStatRow {
  friendly_name?: string;
  user?: string;
  title?: string;
  total_plays?: number;
  total_duration?: number;
  user_id?: number;
  thumb?: string;
  user_thumb?: string;
}

// One get_home_stats group (top_users, top_movies, …) with its rows.
export interface TautulliHomeStat {
  stat_id: string;
  stat_title?: string;
  rows: TautulliHomeStatRow[];
}

// --- JellyStat Types ---
// JellyStat is a Jellyfin statistics server (analogous to Tautulli for Plex).
// Only the fields the app consumes are typed. JellyStat's backend is Postgres
// via node-postgres, which serializes `bigint` columns (Count, Plays,
// PlaybackDuration) as STRINGS — hence the `number | string` unions; callers
// coerce with Number(). Field names match the DB columns verbatim. Live now-
// playing comes from /proxy/getSessions, which passes the raw Jellyfin Sessions
// payload through unchanged, so those reuse JellyfinSession.

// One row from GET /stats/getPlaybackActivity (a jf_playback_activity row).
export interface JellystatActivityRow {
  Id: string;
  UserName?: string;
  NowPlayingItemName?: string;
  SeriesName?: string;
  SeasonId?: string;
  EpisodeId?: string;
  Client?: string;
  DeviceName?: string;
  RemoteEndPoint?: string;
  PlayMethod?: string;
  // Seconds of playback recorded for the session.
  PlaybackDuration?: number | string;
  // ISO timestamp the activity row was inserted.
  ActivityDateInserted?: string;
}

// Pagination envelope shared by JellyStat's paginated endpoints.
export interface JellystatPaginated<T> {
  current_page: number;
  pages: number;
  size: number;
  sort: string;
  desc: boolean;
  results: T[];
}

// One per-library bucket inside a getViews* stats row ({ count, duration }).
export interface JellystatViewBucket {
  count: number | string;
  duration?: number | string;
}

// One bucket row from getViewsOverTime / getViewsByDays / getViewsByHour. `Key`
// is the bucket label — a formatted date string ("Jun 03, 2026"), a full day
// name ("Monday"), or a numeric hour 0–23 (getViewsByHour returns it as a
// number, not a string). The remaining keys are library names mapping to their
// per-bucket counts. The index type spans both so callers coerce with
// String(Key) / Number(bucket.count).
export interface JellystatViewStat {
  Key: string | number;
  [bucket: string]: string | number | JellystatViewBucket;
}

export interface JellystatViewsResponse {
  libraries: { Id: string; Name: string }[];
  stats: JellystatViewStat[];
}

// One row from POST /stats/getMostActiveUsers.
export interface JellystatActiveUser {
  Plays: number | string;
  UserId: string;
  Name: string;
}

// --- Tracearr Types ---
// Read-only public API (/api/v1/public). Only the fields the app consumes are
// typed; see the upstream OpenAPI (routes/public.openapi.ts) for the full shape.

export type TracearrMediaType = "movie" | "episode" | "track" | "live" | "photo" | "unknown";
export type TracearrPlaybackState = "playing" | "paused" | "stopped";

// GET /streams → active playback sessions with codec/quality + summary.
export interface TracearrStream {
  id: string;
  serverId: string;
  serverName: string;
  username: string;
  userAvatarUrl: string | null;
  mediaTitle: string;
  mediaType: TracearrMediaType;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  year: number | null;
  durationMs: number | null;
  state: TracearrPlaybackState;
  progressMs: number;
  startedAt: string;
  // posterUrl is a RELATIVE path (/api/v1/images/proxy?...) served without auth.
  thumbPath: string | null;
  posterUrl: string | null;
  // Stream quality / transcode signals.
  isTranscode: boolean | null;
  videoDecision: "directplay" | "copy" | "transcode" | null;
  audioDecision: "directplay" | "copy" | "transcode" | null;
  // DisplayValues — human-readable strings (e.g. "4K", "1080p").
  resolution: string | null;
  // DeviceInfo.
  device: string | null;
  player: string | null;
  product: string | null;
  platform: string | null;
}

export interface TracearrStreamSummary {
  total: number;
  transcodes: number;
  directStreams: number;
  directPlays: number;
  totalBitrate: string; // e.g. "45.2 Mbps"
}

export interface TracearrStreamsResponse {
  data: TracearrStream[];
  summary: TracearrStreamSummary;
}

// GET /history → paginated session history (grouped by unique play).
export interface TracearrSessionHistory {
  id: string;
  serverId: string;
  serverName: string;
  state: TracearrPlaybackState;
  mediaTitle: string;
  mediaType: TracearrMediaType;
  showTitle: string | null;
  seasonNumber: number | null;
  episodeNumber: number | null;
  year: number | null;
  durationMs: number | null;
  progressMs: number | null;
  totalDurationMs: number | null;
  startedAt: string;
  stoppedAt: string | null;
  watched: boolean;
  resolution: string | null;
  thumbPath: string | null;
  posterUrl: string | null;
  device: string | null;
  player: string | null;
  platform: string | null;
  user: {
    id: string;
    username: string;
    thumbUrl: string | null;
    avatarUrl: string | null;
  };
}

export interface TracearrHistoryResponse {
  data: TracearrSessionHistory[];
  meta: { total: number; page: number; pageSize: number };
}

// --- Prowlarr Types ---

export interface ProwlarrIndexer {
  id: number;
  name: string;
  protocol: "usenet" | "torrent";
  enable: boolean;
  priority: number;
  added: string;
  fields: { name: string; value: unknown }[];
  tags: number[];
  appProfileId: number;
}

export interface ProwlarrIndexerStatus {
  indexerId: number;
  disabledTill?: string;
  mostRecentFailure?: string;
  initialFailure?: string;
}

export interface ProwlarrSearchResult {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  size: number;
  publishDate: string;
  categories: { id: number; name: string }[];
  downloadUrl?: string;
  magnetUrl?: string;
  infoUrl?: string;
  seeders?: number;
  leechers?: number;
  protocol: "usenet" | "torrent";
  age: number;
  ageMinutes: number;
}

export interface ProwlarrIndexerStats {
  indexers: {
    indexerId: number;
    indexerName: string;
    averageResponseTime: number;
    numberOfQueries: number;
    numberOfGrabs: number;
    numberOfFailures: number;
  }[];
}

// --- Plex Types ---

export interface PlexLibrary {
  key: string;
  title: string;
  type: "movie" | "show" | "artist" | "photo";
  scanner: string;
  count?: number;
}

export interface PlexLibrariesResponse {
  MediaContainer: {
    Directory: PlexLibrary[];
  };
}

export interface PlexMediaItem {
  ratingKey: string;
  key: string;
  type: "movie" | "show" | "season" | "episode" | "artist" | "album" | "track";
  title: string;
  parentTitle?: string;
  grandparentTitle?: string;
  summary?: string;
  year?: number;
  thumb?: string;
  art?: string;
  parentThumb?: string;
  grandparentThumb?: string;
  duration?: number;
  addedAt: number;
  updatedAt?: number;
  viewCount?: number;
  lastViewedAt?: number;
  rating?: number;
  audienceRating?: number;
  Media?: PlexMedia[];
}

export interface PlexMedia {
  id: number;
  duration: number;
  bitrate: number;
  videoResolution: string;
  videoCodec: string;
  audioCodec: string;
  container: string;
}

export interface PlexMediaContainer<T> {
  MediaContainer: {
    size: number;
    Metadata?: T[];
  };
}

export interface PlexSession {
  sessionKey: string;
  ratingKey: string;
  type: "movie" | "episode" | "track";
  title: string;
  parentTitle?: string;
  grandparentTitle?: string;
  thumb?: string;
  grandparentThumb?: string;
  year?: number;
  duration: number;
  viewOffset: number;
  Player: {
    title: string;
    platform: string;
    state: "playing" | "paused" | "buffering";
    local: boolean;
    address: string;
  };
  Session: {
    id: string;
    bandwidth: number;
    location: "lan" | "wan";
  };
  TranscodeSession?: {
    videoDecision: "direct play" | "copy" | "transcode";
    audioDecision: "direct play" | "copy" | "transcode";
    progress: number;
    speed: number;
  };
  User: {
    id: number;
    title: string;
    thumb?: string;
  };
}

export interface PlexSessionsResponse {
  MediaContainer: {
    size: number;
    Metadata?: PlexSession[];
  };
}

// --- Jellyfin Types ---

export interface JellyfinUser {
  Id: string;
  Name: string;
  Policy?: {
    IsAdministrator?: boolean;
    IsDisabled?: boolean;
  };
}

export type JellyfinCollectionType =
  | "movies"
  | "tvshows"
  | "music"
  | "musicvideos"
  | "homevideos"
  | "boxsets"
  | "books"
  | "playlists"
  | "livetv"
  | "mixed"
  | string;

export interface JellyfinLibrary {
  Id: string;
  Name: string;
  CollectionType?: JellyfinCollectionType;
  ImageTags?: { Primary?: string };
}

export interface JellyfinUserData {
  PlayedPercentage?: number;
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  Played?: boolean;
  LastPlayedDate?: string;
}

export type JellyfinItemType =
  | "Movie"
  | "Series"
  | "Season"
  | "Episode"
  | "Audio"
  | "MusicAlbum"
  | "MusicArtist"
  | "BoxSet"
  | "CollectionFolder"
  | "Folder"
  | string;

export interface JellyfinItem {
  Id: string;
  Name: string;
  Type: JellyfinItemType;
  SeriesId?: string;
  SeriesName?: string;
  SeasonId?: string;
  SeasonName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  ProductionYear?: number;
  PremiereDate?: string;
  DateCreated?: string;
  RunTimeTicks?: number;
  Overview?: string;
  CommunityRating?: number;
  ImageTags?: {
    Primary?: string;
    Backdrop?: string;
    Thumb?: string;
    Logo?: string;
  };
  BackdropImageTags?: string[];
  ParentBackdropImageTags?: string[];
  ParentBackdropItemId?: string;
  SeriesPrimaryImageTag?: string;
  ParentThumbImageTag?: string;
  ParentThumbItemId?: string;
  UserData?: JellyfinUserData;
}

export interface JellyfinItemsResponse {
  Items: JellyfinItem[];
  TotalRecordCount: number;
}

export interface JellyfinTranscodingInfo {
  AudioCodec?: string;
  VideoCodec?: string;
  Container?: string;
  IsVideoDirect?: boolean;
  IsAudioDirect?: boolean;
  Bitrate?: number;
  Framerate?: number;
  CompletionPercentage?: number;
  Width?: number;
  Height?: number;
  TranscodeReasons?: string[];
}

export interface JellyfinPlayState {
  PositionTicks?: number;
  CanSeek?: boolean;
  IsPaused?: boolean;
  IsMuted?: boolean;
  PlayMethod?: "Transcode" | "DirectStream" | "DirectPlay";
  RepeatMode?: string;
}

export interface JellyfinSession {
  Id: string;
  UserId?: string;
  UserName?: string;
  Client: string;
  DeviceName: string;
  DeviceId?: string;
  ApplicationVersion?: string;
  RemoteEndPoint?: string;
  IsActive?: boolean;
  NowPlayingItem?: JellyfinItem;
  PlayState?: JellyfinPlayState;
  TranscodingInfo?: JellyfinTranscodingInfo;
}

// Emby and Jellyfin return identical wire shapes, so the shared media-server
// layer (services/jellyfin-api.ts, the hooks factory, the screen/widget) reads
// these under service-neutral names. Aliases, not new interfaces — one set of
// types serves both.
export type MediaServerUser = JellyfinUser;
export type MediaServerLibrary = JellyfinLibrary;
export type MediaServerItem = JellyfinItem;
export type MediaServerItemsResponse = JellyfinItemsResponse;
export type MediaServerSession = JellyfinSession;

// --- Glances Types ---

export interface GlancesCpu {
  // Only `total` is guaranteed across platforms — Glances computes it itself.
  // The rest depend on the host OS: macOS/Windows omit `iowait`, and some
  // older builds/proxies may drop other fields too.
  total: number;
  user?: number;
  system?: number;
  idle?: number;
  iowait?: number;
  cpucore?: number;
}

export interface GlancesMem {
  total: number;
  used: number;
  free: number;
  available?: number;
  percent: number;
  cached?: number;
  buffers?: number;
}

export interface GlancesFsItem {
  device_name: string;
  mnt_point: string;
  fs_type: string;
  size: number;
  used: number;
  free: number;
  percent: number;
}

export interface GlancesPerCpuItem {
  cpu_number: number;
  total: number;
  user?: number;
  system?: number;
  idle?: number;
}

export interface GlancesLoad {
  min1: number;
  min5: number;
  min15: number;
  cpucore: number;
}

export interface GlancesDiskIOItem {
  disk_name: string;
  read_bytes: number;
  write_bytes: number;
  read_count: number;
  write_count: number;
  time_since_update: number;
}

export interface GlancesNetItem {
  interface_name: string;
  // Optional human alias configured in Glances; prefer it for display.
  alias?: string | null;
  is_up?: boolean;
  // bytes_recv/bytes_sent are the deltas since the last sample (same as the
  // diskio plugin), so rate = bytes / time_since_update. Glances v4 also ships
  // the pre-computed *_rate_per_sec fields; prefer those when present.
  bytes_recv: number;
  bytes_sent: number;
  bytes_all?: number;
  bytes_recv_rate_per_sec?: number | null;
  bytes_sent_rate_per_sec?: number | null;
  // Max link speed in bits/sec (0 when the OS can't report it).
  speed?: number;
  time_since_update: number;
}

export interface GlancesGpuItem {
  key: string;
  gpu_id: string;
  name: string;
  // mem is VRAM utilization percent (used / total * 100), not absolute bytes —
  // Glances doesn't expose absolute VRAM via the GPU plugin. proc is GPU
  // compute utilization percent. Both may be null on backends that can't
  // report them (e.g. some AMD/Intel/ARM cards lack fan_speed/temperature).
  mem: number | null;
  proc: number | null;
  temperature: number | null;
  fan_speed: number | null;
}

export interface GlancesContainerItem {
  id: string;
  name: string;
  // One of: running, paused, created, restarting, removing, exited, dead, and
  // (when a Docker healthcheck is configured) healthy/unhealthy/starting.
  status: string;
  // Docker reports image as a single-element list of comma-joined tags; Podman
  // and some builds send a plain string. Normalize at render time.
  image?: string | string[];
  cpu_percent?: number | null;
  memory_usage?: number | null;
  memory_limit?: number | null;
  uptime?: string;
  engine?: string;
}

// --- Bazarr Types ---

export interface BazarrMissingSubtitle {
  name: string; // language name
  code2: string;
  code3: string;
  hi: boolean;
  forced: boolean;
}

export interface BazarrWantedMovie {
  radarrId: number;
  title: string;
  missing_subtitles: BazarrMissingSubtitle[];
  sceneName?: string;
  tags?: string[];
  poster?: string;
  year?: string;
  hearing_impaired?: boolean;
}

export interface BazarrWantedEpisode {
  sonarrSeriesId: number;
  sonarrEpisodeId: number;
  seriesTitle: string;
  episodeTitle: string;
  episode_number: string; // e.g. "1x01"
  missing_subtitles: BazarrMissingSubtitle[];
  sceneName?: string;
  tags?: string[];
  hearing_impaired?: boolean;
}

export interface BazarrWantedResponse<T> {
  data: T[];
  total: number;
}

export type BazarrWantedMoviesResponse = BazarrWantedResponse<BazarrWantedMovie>;
export type BazarrWantedEpisodesResponse = BazarrWantedResponse<BazarrWantedEpisode>;

export interface BazarrHistoryItem {
  action: number;
  timestamp: string;
  description: string;
  language?: { name: string; code2: string; code3?: string };
  provider?: string;
  score?: string;
  title?: string;
  seriesTitle?: string;
  episodeTitle?: string;
  subtitles_path?: string;
  radarrId?: number;
  sonarrSeriesId?: number;
  sonarrEpisodeId?: number;
}

export interface BazarrHistoryResponse {
  data: BazarrHistoryItem[];
  total: number;
}

export interface BazarrProvider {
  name: string;
  status: string;
  retry?: string;
}

// --- unRAID Types ---
// App-shaped views over the official GraphQL API (services/unraid-api.ts maps
// the raw schema shapes into these). BigInt schema fields arrive as strings —
// the mappers coerce them to numbers before they reach these types.

export interface UnraidContainer {
  id: string;
  // First names[] entry with the leading "/" stripped.
  name: string;
  image: string;
  // ContainerState enum from the schema, e.g. "RUNNING" / "EXITED" / "PAUSED".
  state: string;
  // Human string from Docker, e.g. "Up 3 days".
  status: string;
  autoStart: boolean;
  isUpdateAvailable?: boolean;
  isOrphaned?: boolean;
}

export interface UnraidCapacity {
  free: number;
  used: number;
  total: number;
}

export interface UnraidArrayDisk {
  idx: number;
  // "parity", "disk1", "cache", or a named-pool member.
  name: string;
  device?: string;
  size: number;
  // ArrayDiskStatus, e.g. "DISK_OK".
  status: string;
  // ArrayDiskType: DATA | PARITY | CACHE | FLASH.
  type: string;
  temp?: number | null;
  rotational?: boolean;
  isSpinning?: boolean;
  // Filesystem fields are null for parity disks (no filesystem).
  fsSize?: number | null;
  fsFree?: number | null;
  fsUsed?: number | null;
  fsType?: string | null;
}

export interface UnraidPhysicalDisk {
  id: string;
  device: string;
  name: string;
  vendor?: string;
  size: number;
  serialNum?: string;
  temperature?: number | null;
  smartStatus?: string;
  isSpinning?: boolean;
  interfaceType?: string;
}

export interface UnraidPool {
  name: string;
  disks: UnraidArrayDisk[];
}

export interface UnraidParityCheck {
  running: boolean;
  progress?: number | null;
  speed?: string | null;
  errors?: number | null;
}

// The grouped storage view the disks screen renders: unRAID's array plus the
// Pool / Unassigned grouping computed in groupUnraidStorage().
export interface UnraidStorage {
  // ArrayState, e.g. "STARTED" / "STOPPED".
  arrayState: string;
  capacity: UnraidCapacity;
  parityCheck: UnraidParityCheck | null;
  parities: UnraidArrayDisk[];
  dataDisks: UnraidArrayDisk[];
  pools: UnraidPool[];
  unassigned: UnraidPhysicalDisk[];
}

// --- Shared Types ---

// Tri-state status for the green/orange/red dots:
//   - "ok"          server reachable AND credentials valid
//   - "auth_failed" server reachable but credentials rejected
//   - "offline"     server unreachable (network error, timeout, 5xx)
export type HealthStatusKind = "ok" | "auth_failed" | "offline";

// Health entry for a single configured instance — one kind can have many.
// `online` is preserved for back-compat consumers that only care about
// reachability (an auth_failed server is still "online" by that definition);
// `status` is the richer tri-state used by the dot indicators.
export interface ServiceInstanceHealthStatus {
  instanceId: string;
  instanceName: string;
  online: boolean;
  status: HealthStatusKind;
  responseTime?: number;
  // Server-supplied error message when status is "auth_failed" or "offline".
  // Surfaced verbatim in places like the instance row subtitle so the user
  // can tell whether it's a wrong API key vs. a TLS handshake failure.
  message?: string;
}

// Aggregated health for a service kind. The top-level `online`/`status`/
// `responseTime` are derived from `instances` so existing consumers
// (`healthData.find(s => s.id === "tautulli").online`) keep working as if
// each kind were a singleton. Aggregation prefers the best status across
// instances: any "ok" → kind is "ok"; otherwise any "auth_failed" →
// "auth_failed"; otherwise "offline".
export interface ServiceHealthStatus {
  id: string;
  name: string;
  online: boolean;
  status: HealthStatusKind;
  responseTime?: number;
  instances: ServiceInstanceHealthStatus[];
}
