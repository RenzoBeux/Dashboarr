import type { ComponentType } from "react";
import {
  Download,
  CheckCircle2,
  XCircle,
  Trash2,
  Pencil,
  Ban,
  History,
} from "lucide-react-native";
import type {
  ArrHistoryData,
  ArrQualityModel,
  RadarrHistoryRecord,
  SonarrHistoryRecord,
} from "@/lib/types";

// A single grab/import/delete event, normalized so the shared history UI can
// render Radarr and Sonarr records through one code path. Both services expose
// the same `data`/`quality`/`languages` shape, so the two normalizers below are
// thin wrappers around one internal function.
export interface ArrHistoryEntry {
  id: number;
  eventType: string;
  // The release name (sourceTitle); falls back to the event label when absent.
  title: string;
  date?: string;
  indexer?: string;
  releaseGroup?: string;
  qualityName?: string;
  sizeBytes?: number;
  downloadClient?: string;
  protocol?: string;
  languages: string[];
  // Populated for failed/ignored events, mirroring a release rejection reason.
  reason?: string;
}

export type HistoryTone = "grab" | "success" | "danger" | "muted" | "info";

export interface HistoryEventMeta {
  label: string;
  icon: ComponentType<any>;
  tone: HistoryTone;
}

// Purple for grabs matches the *arr "grabbing" badge used elsewhere in the app
// (see lib/arr-poster-status.ts); the rest follow the app's semantic palette.
export const HISTORY_TONE_COLOR: Record<HistoryTone, string> = {
  grab: "#a855f7",
  success: "#22c55e",
  danger: "#ef4444",
  muted: "#71717a",
  info: "#3b82f6",
};

const EVENT_META: Record<string, HistoryEventMeta> = {
  grabbed: { label: "Grabbed", icon: Download, tone: "grab" },
  downloadFolderImported: { label: "Imported", icon: CheckCircle2, tone: "success" },
  downloadImported: { label: "Imported", icon: CheckCircle2, tone: "success" },
  movieFolderImported: { label: "Imported", icon: CheckCircle2, tone: "success" },
  downloadFailed: { label: "Failed", icon: XCircle, tone: "danger" },
  importFailed: { label: "Import Failed", icon: XCircle, tone: "danger" },
  downloadIgnored: { label: "Ignored", icon: Ban, tone: "muted" },
  movieFileDeleted: { label: "File Deleted", icon: Trash2, tone: "muted" },
  episodeFileDeleted: { label: "File Deleted", icon: Trash2, tone: "muted" },
  movieFileRenamed: { label: "Renamed", icon: Pencil, tone: "muted" },
  episodeFileRenamed: { label: "Renamed", icon: Pencil, tone: "muted" },
};

function prettifyEventType(eventType: string): string {
  if (!eventType) return "Event";
  const spaced = eventType.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function historyEventMeta(eventType: string): HistoryEventMeta {
  return (
    EVENT_META[eventType] ?? {
      label: prettifyEventType(eventType),
      icon: History,
      tone: "info",
    }
  );
}

interface RawHistoryRecord {
  id: number;
  eventType: string;
  sourceTitle?: string;
  date?: string;
  data?: ArrHistoryData;
  quality?: ArrQualityModel;
  languages?: { id: number; name: string }[];
}

function normalize(record: RawHistoryRecord): ArrHistoryEntry {
  const data = record.data ?? {};
  const size = data.size ? Number(data.size) : NaN;
  return {
    id: record.id,
    eventType: record.eventType,
    title: record.sourceTitle || historyEventMeta(record.eventType).label,
    date: record.date,
    indexer: data.indexer || undefined,
    releaseGroup: data.releaseGroup || undefined,
    qualityName: record.quality?.quality?.name,
    sizeBytes: Number.isFinite(size) && size > 0 ? size : undefined,
    downloadClient: data.downloadClient || data.downloadClientName || undefined,
    protocol: data.protocol || undefined,
    languages: (record.languages ?? [])
      .map((l) => l.name)
      .filter((name): name is string => !!name),
    reason: data.reason || undefined,
  };
}

export function normalizeRadarrHistory(
  record: RadarrHistoryRecord,
): ArrHistoryEntry {
  return normalize(record);
}

export function normalizeSonarrHistory(
  record: SonarrHistoryRecord,
): ArrHistoryEntry {
  return normalize(record);
}
