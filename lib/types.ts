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

export type TorrentState =
  | "error"
  | "missingFiles"
  | "uploading"
  | "pausedUP"
  | "queuedUP"
  | "stalledUP"
  | "checkingUP"
  | "forcedUP"
  | "allocating"
  | "downloading"
  | "metaDL"
  | "pausedDL"
  | "queuedDL"
  | "stalledDL"
  | "checkingDL"
  | "forcedDL"
  | "checkingResumeData"
  | "moving"
  | "unknown";

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

// --- Radarr Types ---

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
  sizeOnDisk: number;
  images: RadarrImage[];
  ratings: { votes: number; value: number };
  runtime: number;
  qualityProfileId: number;
  rootFolderPath: string;
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
}

export interface SonarrImage {
  coverType: "poster" | "banner" | "fanart";
  url: string;
  remoteUrl: string;
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
}

export interface OverseerrTVDetails {
  id: number;
  name: string;
  posterPath?: string;
  firstAirDate?: string;
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

// --- Shared Types ---

export interface ServiceHealthStatus {
  id: string;
  name: string;
  online: boolean;
  responseTime?: number;
}
