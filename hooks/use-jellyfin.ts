import { createMediaServerHooks } from "@/hooks/use-media-server";

// Jellyfin-bound instantiation of the shared media-server hooks. Emby uses the
// same factory in use-emby.ts; the only difference is the serviceId, which
// scopes the query keys and instance gating. Keeping these named exports means
// existing Jellyfin import sites are unchanged.
const jellyfin = createMediaServerHooks("jellyfin");

export const useJellyfinUserId = jellyfin.useUserId;
export const useJellyfinLibraries = jellyfin.useLibraries;
export const useJellyfinRecentlyAdded = jellyfin.useRecentlyAdded;
export const useJellyfinResumeItems = jellyfin.useResumeItems;
export const useJellyfinSessions = jellyfin.useSessions;
