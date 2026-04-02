import { useQuery } from "@tanstack/react-query";
import {
  getLibraries,
  getLibraryContents,
  getRecentlyAdded,
  getOnDeck,
  getSessions,
  getMetadata,
} from "@/services/plex-api";
import { useConfigStore } from "@/store/config-store";
import { POLLING_INTERVALS } from "@/lib/constants";

function usePlexEnabled() {
  return useConfigStore((s) => s.services.plex.enabled);
}

export function usePlexLibraries() {
  const enabled = usePlexEnabled();
  return useQuery({
    queryKey: ["plex", "libraries"],
    queryFn: getLibraries,
    enabled,
    staleTime: 300000,
  });
}

export function usePlexLibraryContents(sectionKey: string, start = 0, size = 50) {
  return useQuery({
    queryKey: ["plex", "library", sectionKey, start, size],
    queryFn: () => getLibraryContents(sectionKey, start, size),
    enabled: !!sectionKey,
  });
}

export function usePlexRecentlyAdded(sectionKey?: string, count = 20) {
  const enabled = usePlexEnabled();
  return useQuery({
    queryKey: ["plex", "recentlyAdded", sectionKey],
    queryFn: () => getRecentlyAdded(sectionKey, count),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled,
  });
}

export function usePlexOnDeck() {
  const enabled = usePlexEnabled();
  return useQuery({
    queryKey: ["plex", "onDeck"],
    queryFn: () => getOnDeck(),
    refetchInterval: POLLING_INTERVALS.calendar,
    enabled,
  });
}

export function usePlexSessions() {
  const enabled = usePlexEnabled();
  return useQuery({
    queryKey: ["plex", "sessions"],
    queryFn: getSessions,
    refetchInterval: POLLING_INTERVALS.activeTorrents, // 5s
    enabled,
  });
}

export function usePlexMetadata(ratingKey: string) {
  return useQuery({
    queryKey: ["plex", "metadata", ratingKey],
    queryFn: () => getMetadata(ratingKey),
    enabled: !!ratingKey,
  });
}
