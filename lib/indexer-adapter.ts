import type { ComponentType } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type { ServiceId } from "@/lib/constants";

// Shared release-search surface for indexer proxies (Prowlarr, Jackett). The
// adapter covers ONLY the search + grab flow — indexer lists and stats stay
// per-service because the capability overlap is too narrow to abstract
// (Prowlarr has toggle/status/stats REST endpoints; Jackett's admin API is
// cookie-authed and off limits).

// One normalized release row, rendered by the shared ReleaseCard in the
// Indexers tab search and the global-search Releases sections.
export interface UnifiedRelease {
  // Stable list key (Prowlarr: guid; Jackett: `${TrackerId}:${Guid}`).
  id: string;
  title: string;
  // Source tracker/indexer display name.
  indexer: string;
  sizeBytes: number;
  seeders?: number;
  leechers?: number;
  protocol: "torrent" | "usenet";
  magnetUrl?: string;
  downloadUrl?: string;
  infoUrl?: string;
  // Prowlarr server-side grab payload; undefined for Jackett (its grab is a
  // client-side magnet/link handoff instead).
  grab?: { guid: string; indexerId: number };
}

export interface GrabFlowProps {
  // The release being grabbed; null renders the flow closed.
  release: UnifiedRelease | null;
  onClose: () => void;
  instanceId?: string;
}

// Self-contained grab affordance: owns its own modals/mutations so the shared
// views never branch on kind (same trick as TorrentAdapter.SpeedLimitsControl).
export interface IndexerSearchAdapter {
  serviceId: ServiceId;
  displayName: string;
  // Wraps the kind-specific search hook and maps results to UnifiedRelease[].
  useSearch: (query: string, instanceId?: string) => UseQueryResult<UnifiedRelease[]>;
  GrabFlow: ComponentType<GrabFlowProps>;
}
