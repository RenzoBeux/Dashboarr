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
  sizeOnDisk: number;
  images: RadarrImage[];
  ratings: RatingsBundle;
  runtime: number;
  qualityProfileId: number;
  rootFolderPath: string;
  movieFile?: RadarrMovieFile;
  genres?: string[];
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

export type RadarrRelease = ArrRelease;

export interface SonarrRelease extends ArrRelease {
  mappedSeasonNumber?: number;
  mappedEpisodeNumbers?: number[];
  fullSeason?: boolean;
  isAbsoluteNumbering?: boolean;
  isDaily?: boolean;
  episodeRequested?: boolean;
}

// --- Sonarr Types ---

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
  ratings?: RatingsBundle;
  genres?: string[];
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
  };
}

export interface OverseerrSearchResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: OverseerrMediaResult[];
}

export interface OverseerrMovieDetails {
  id: number;
  title: string;
  posterPath?: string;
  releaseDate?: string;
  mediaInfo?: {
    id: number;
    status: OverseerrMediaStatus;
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

// --- Glances Types ---

export interface GlancesCpu {
  total: number;
  user: number;
  system: number;
  idle: number;
  iowait: number;
  cpucore: number;
}

export interface GlancesMem {
  total: number;
  used: number;
  free: number;
  available: number;
  percent: number;
  cached: number;
  buffers: number;
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
  user: number;
  system: number;
  idle: number;
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

// --- Shared Types ---

// Health entry for a single configured instance — one kind can have many.
export interface ServiceInstanceHealthStatus {
  instanceId: string;
  instanceName: string;
  online: boolean;
  responseTime?: number;
}

// Aggregated health for a service kind. The top-level `online`/`responseTime`
// are derived from `instances` so existing consumers (`healthData.find(s => s.id ===
// "tautulli").online`) keep working as if each kind were a singleton: the kind
// is "online" when at least one of its instances is reachable, and shows the
// fastest of those response times. Per-instance breakdown lives under
// `instances` for the notification watcher and the service-health card.
export interface ServiceHealthStatus {
  id: string;
  name: string;
  online: boolean;
  responseTime?: number;
  instances: ServiceInstanceHealthStatus[];
}
