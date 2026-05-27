import { createMediaServerHooks } from "@/hooks/use-media-server";

// Emby-bound instantiation of the shared media-server hooks (mirror of
// use-jellyfin.ts). Emby and Jellyfin share the same API; serviceId="emby"
// scopes the query keys and instance gating to the Emby kind.
const emby = createMediaServerHooks("emby");

export const useEmbyUserId = emby.useUserId;
export const useEmbyLibraries = emby.useLibraries;
export const useEmbyRecentlyAdded = emby.useRecentlyAdded;
export const useEmbyResumeItems = emby.useResumeItems;
export const useEmbySessions = emby.useSessions;
