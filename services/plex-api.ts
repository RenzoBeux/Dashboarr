import { useConfigStore } from "@/store/config-store";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import { getDemoPlexResponse } from "@/lib/demo-data";
import type {
  PlexLibrariesResponse,
  PlexLibrary,
  PlexMediaItem,
  PlexMediaContainer,
  PlexSession,
  PlexSessionsResponse,
} from "@/lib/types";

async function plexRequest<T>(path: string): Promise<T> {
  const store = useConfigStore.getState();

  if (store.demoMode) {
    await new Promise((r) => setTimeout(r, 80 + Math.random() * 120));
    return (getDemoPlexResponse(path) ?? undefined) as T;
  }

  const config = store.services.plex;
  const secrets = store.secrets.plex;

  if (!config.enabled) throw new Error("Plex is not enabled");

  const baseUrl = store.getActiveUrl("plex");
  if (!baseUrl) throw new Error("No URL configured for Plex");

  const url = new URL(path, baseUrl);
  if (secrets.apiKey) {
    url.searchParams.set("X-Plex-Token", secrets.apiKey);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url.toString(), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Plex HTTP ${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeoutId);
  }
}

// --- Libraries ---

export async function getLibraries(): Promise<PlexLibrary[]> {
  const data = await plexRequest<PlexLibrariesResponse>("/library/sections");
  return data.MediaContainer.Directory;
}

// --- Library Contents ---

export async function getLibraryContents(
  sectionKey: string,
  start = 0,
  size = 50,
): Promise<{ items: PlexMediaItem[]; totalSize: number }> {
  const data = await plexRequest<PlexMediaContainer<PlexMediaItem>>(
    `/library/sections/${sectionKey}/all?X-Plex-Container-Start=${start}&X-Plex-Container-Size=${size}`,
  );
  return {
    items: data.MediaContainer.Metadata ?? [],
    totalSize: data.MediaContainer.size,
  };
}

// --- Recently Added ---

export async function getRecentlyAdded(
  sectionKey?: string,
  count = 20,
): Promise<PlexMediaItem[]> {
  const path = sectionKey
    ? `/library/sections/${sectionKey}/recentlyAdded?X-Plex-Container-Size=${count}`
    : `/library/recentlyAdded?X-Plex-Container-Size=${count}`;
  const data = await plexRequest<PlexMediaContainer<PlexMediaItem>>(path);
  return data.MediaContainer.Metadata ?? [];
}

// --- On Deck ---

export async function getOnDeck(count = 20): Promise<PlexMediaItem[]> {
  const data = await plexRequest<PlexMediaContainer<PlexMediaItem>>(
    `/library/onDeck?X-Plex-Container-Size=${count}`,
  );
  return data.MediaContainer.Metadata ?? [];
}

// --- Now Playing (Sessions) ---

export async function getSessions(): Promise<PlexSession[]> {
  const data = await plexRequest<PlexSessionsResponse>("/status/sessions");
  return data.MediaContainer.Metadata ?? [];
}

// --- Media Metadata ---

export async function getMetadata(ratingKey: string): Promise<PlexMediaItem | null> {
  const data = await plexRequest<PlexMediaContainer<PlexMediaItem>>(
    `/library/metadata/${ratingKey}`,
  );
  return data.MediaContainer.Metadata?.[0] ?? null;
}

// --- Image URL helpers ---

export function getPlexImageUrl(
  thumbPath: string | undefined | null,
  width = 300,
  height = 450,
): string | null {
  if (!thumbPath) return null;
  const store = useConfigStore.getState();
  const baseUrl = store.getActiveUrl("plex");
  const secrets = store.secrets.plex;
  return `${baseUrl}/photo/:/transcode?width=${width}&height=${height}&minSize=1&url=${encodeURIComponent(thumbPath)}&X-Plex-Token=${secrets.apiKey}`;
}
