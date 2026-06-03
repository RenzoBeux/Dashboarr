import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getArtists,
  getArtist,
  getAlbums,
  getAlbum,
  getTracks,
  getQueue,
  getAllWantedMissing,
  searchArtists,
  addArtist,
  deleteArtist,
  searchArtist,
  searchAlbums,
  searchAllMissingAlbums,
  toggleArtistMonitored,
  toggleAlbumMonitored,
  updateArtist,
  changeArtistRootFolder,
  getQualityProfiles,
  getMetadataProfiles,
  getRootFolders,
  getTags,
} from "@/services/lidarr-api";
import { toast, toastError } from "@/components/ui/toast";
import type { LidarrArtist, LidarrAlbum } from "@/lib/types";
import { POLLING_INTERVALS } from "@/lib/constants";
import { useInstanceTarget } from "@/hooks/use-instance-target";

// Per-instance cache keying: every hook accepts an optional `instanceId`. When
// omitted the user's active Lidarr is used (single-instance behavior); when
// passed, queries fan out to that specific instance with its own cache slot.

export function useLidarrArtists(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "artists"],
    queryFn: () => getArtists(id ?? undefined),
    enabled: enabled && !!id,
  });
}

export function useLidarrArtist(artistId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "artist", artistId],
    queryFn: () => getArtist(artistId, id ?? undefined),
    enabled: artistId > 0 && !!id,
  });
}

export function useLidarrAlbums(artistId: number, instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "albums", artistId],
    queryFn: () => getAlbums(artistId, id ?? undefined),
    enabled: enabled && artistId > 0 && !!id,
  });
}

export function useLidarrAlbum(albumId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "album", albumId],
    queryFn: () => getAlbum(albumId, id ?? undefined),
    enabled: albumId > 0 && !!id,
  });
}

export function useLidarrTracks(albumId: number, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "tracks", albumId],
    queryFn: () => getTracks(albumId, id ?? undefined),
    enabled: albumId > 0 && !!id,
  });
}

export function useLidarrQueue(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "queue"],
    queryFn: () => getQueue(1, 20, id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

// Fetches the complete wanted/missing list (all pages). Only mounted by the
// Music "Wanted" tab. The key is namespaced with "all" so it never aliases the
// count-only ["lidarr", id, "wanted"] entry the dashboard's LidarrQueueCard owns
// — sharing a key would let its 1-record badge fetch clobber the full list.
export function useLidarrWantedMissing(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "wanted", "all"],
    queryFn: () => getAllWantedMissing(id ?? undefined),
    refetchInterval: POLLING_INTERVALS.queue,
    enabled: enabled && !!id,
  });
}

export function useLidarrSearch(term: string, instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "search", term],
    queryFn: () => searchArtists(term, id ?? undefined),
    enabled: term.length >= 2 && !!id,
  });
}

export function useAddArtist(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: (artist: Parameters<typeof addArtist>[0]) =>
      addArtist(artist, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artists"] });
    },
  });
}

export function useDeleteArtist(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: ({
      id: artistId,
      deleteFiles = false,
    }: {
      id: number;
      deleteFiles?: boolean;
    }) => deleteArtist(artistId, deleteFiles, id ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artists"] });
    },
  });
}

export function useSearchArtist(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: (artistId: number) => searchArtist(artistId, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useSearchAlbums(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: (albumIds: number[]) => searchAlbums(albumIds, id ?? undefined),
    onSuccess: () => toast("Search started"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useSearchAllMissingAlbums(instanceId?: string) {
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: () => searchAllMissingAlbums(id ?? undefined),
    onSuccess: () => toast("Searching all missing albums"),
    onError: (err) => toastError("Search failed", err),
  });
}

export function useToggleArtistMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: ({
      artistId,
      monitored,
    }: {
      artistId: number;
      monitored: boolean;
    }) => toggleArtistMonitored(artistId, monitored, id ?? undefined),
    onMutate: async ({ artistId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "artists"] });
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "artist", artistId] });

      const prevList = queryClient.getQueryData<LidarrArtist[]>(["lidarr", id, "artists"]);
      const prevDetail = queryClient.getQueryData<LidarrArtist>([
        "lidarr",
        id,
        "artist",
        artistId,
      ]);

      if (prevList) {
        queryClient.setQueryData<LidarrArtist[]>(
          ["lidarr", id, "artists"],
          prevList.map((a) => (a.id === artistId ? { ...a, monitored } : a)),
        );
      }
      if (prevDetail) {
        queryClient.setQueryData<LidarrArtist>(
          ["lidarr", id, "artist", artistId],
          { ...prevDetail, monitored },
        );
      }

      return { prevList, prevDetail };
    },
    onError: (err, { artistId }, context) => {
      if (context?.prevList) {
        queryClient.setQueryData(["lidarr", id, "artists"], context.prevList);
      }
      if (context?.prevDetail) {
        queryClient.setQueryData(["lidarr", id, "artist", artistId], context.prevDetail);
      }
      toastError("Failed to update monitoring", err);
    },
    onSettled: (_data, _err, { artistId }) => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artists"] });
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artist", artistId] });
    },
  });
}

export function useToggleAlbumMonitored(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: ({
      albumId,
      monitored,
    }: {
      albumId: number;
      artistId: number;
      monitored: boolean;
    }) => toggleAlbumMonitored(albumId, monitored, id ?? undefined),
    onMutate: async ({ albumId, artistId, monitored }) => {
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "album", albumId] });
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "albums", artistId] });

      const prevDetail = queryClient.getQueryData<LidarrAlbum>([
        "lidarr",
        id,
        "album",
        albumId,
      ]);
      const prevList = queryClient.getQueryData<LidarrAlbum[]>([
        "lidarr",
        id,
        "albums",
        artistId,
      ]);

      if (prevDetail) {
        queryClient.setQueryData<LidarrAlbum>(
          ["lidarr", id, "album", albumId],
          { ...prevDetail, monitored },
        );
      }
      if (prevList) {
        queryClient.setQueryData<LidarrAlbum[]>(
          ["lidarr", id, "albums", artistId],
          prevList.map((a) => (a.id === albumId ? { ...a, monitored } : a)),
        );
      }

      return { prevDetail, prevList };
    },
    onError: (err, { albumId, artistId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(["lidarr", id, "album", albumId], context.prevDetail);
      }
      if (context?.prevList) {
        queryClient.setQueryData(["lidarr", id, "albums", artistId], context.prevList);
      }
      toastError("Failed to update monitoring", err);
    },
    onSettled: (_data, _err, { albumId, artistId }) => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "album", albumId] });
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "albums", artistId] });
    },
  });
}

export function useUpdateArtistQualityProfile(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: ({
      artistId,
      qualityProfileId,
    }: {
      artistId: number;
      qualityProfileId: number;
    }) => {
      const cached = queryClient.getQueryData<LidarrArtist>([
        "lidarr",
        id,
        "artist",
        artistId,
      ]);
      if (!cached) throw new Error("Artist not loaded");
      return updateArtist({ ...cached, qualityProfileId }, id ?? undefined);
    },
    onMutate: async ({ artistId, qualityProfileId }) => {
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "artist", artistId] });
      const prevDetail = queryClient.getQueryData<LidarrArtist>([
        "lidarr",
        id,
        "artist",
        artistId,
      ]);
      if (prevDetail) {
        queryClient.setQueryData<LidarrArtist>(
          ["lidarr", id, "artist", artistId],
          { ...prevDetail, qualityProfileId },
        );
      }
      return { prevDetail };
    },
    onError: (err, { artistId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(["lidarr", id, "artist", artistId], context.prevDetail);
      }
      toastError("Failed to update quality profile", err);
    },
    onSettled: (_data, _err, { artistId }) => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artist", artistId] });
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artists"] });
    },
  });
}

export function useUpdateArtistRootFolder(instanceId?: string) {
  const queryClient = useQueryClient();
  const { instanceId: id } = useInstanceTarget("lidarr", instanceId);
  return useMutation({
    mutationFn: ({
      artistId,
      rootFolderPath,
      moveFiles,
    }: {
      artistId: number;
      rootFolderPath: string;
      moveFiles: boolean;
    }) => changeArtistRootFolder(artistId, rootFolderPath, moveFiles, id ?? undefined),
    onMutate: async ({ artistId, rootFolderPath }) => {
      await queryClient.cancelQueries({ queryKey: ["lidarr", id, "artist", artistId] });
      const prevDetail = queryClient.getQueryData<LidarrArtist>([
        "lidarr",
        id,
        "artist",
        artistId,
      ]);
      if (prevDetail) {
        queryClient.setQueryData<LidarrArtist>(
          ["lidarr", id, "artist", artistId],
          { ...prevDetail, rootFolderPath },
        );
      }
      return { prevDetail };
    },
    onError: (err, { artistId }, context) => {
      if (context?.prevDetail) {
        queryClient.setQueryData(["lidarr", id, "artist", artistId], context.prevDetail);
      }
      toastError("Failed to update root folder", err);
    },
    onSettled: (_data, _err, { artistId }) => {
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artist", artistId] });
      queryClient.invalidateQueries({ queryKey: ["lidarr", id, "artists"] });
    },
  });
}

export function useLidarrQualityProfiles(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "qualityProfiles"],
    queryFn: () => getQualityProfiles(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useLidarrMetadataProfiles(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "metadataProfiles"],
    queryFn: () => getMetadataProfiles(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useLidarrRootFolders(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "rootFolders"],
    queryFn: () => getRootFolders(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}

export function useLidarrTags(instanceId?: string) {
  const { instanceId: id, enabled } = useInstanceTarget("lidarr", instanceId);
  return useQuery({
    queryKey: ["lidarr", id, "tags"],
    queryFn: () => getTags(id ?? undefined),
    enabled: enabled && !!id,
    staleTime: Infinity,
  });
}
