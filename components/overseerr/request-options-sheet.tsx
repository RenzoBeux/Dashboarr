import { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Plus, Film, Tv } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { FilterChip } from "@/components/ui/filter-chip";
import { Toggle } from "@/components/ui/toggle";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast } from "@/components/ui/toast";
import {
  RequestErrorBanner,
  type RequestError,
} from "@/components/overseerr/request-error-banner";
import { getHttpErrorMessage, formatErrorForCopy } from "@/lib/http-client";
import { getPosterUrl } from "@/services/overseerr-api";
import {
  useOverseerrRadarrServers,
  useOverseerrSonarrServers,
  useOverseerrRadarrServerDetails,
  useOverseerrSonarrServerDetails,
  useOverseerrMediaDetails,
  useRequestMovie,
  useRequestTV,
} from "@/hooks/use-overseerr";
import type { OverseerrMediaResult, OverseerrTVDetails } from "@/lib/types";
import { formatBytes } from "@/lib/utils";

interface RequestOptionsSheetProps {
  item: OverseerrMediaResult | null;
  visible: boolean;
  onClose: () => void;
  onRequested?: () => void;
  // Preselect the 4K quality tier (e.g. when opened from a "Request 4K" action).
  initialIs4k?: boolean;
}

export function RequestOptionsSheet({
  item,
  visible,
  onClose,
  onRequested,
  initialIs4k = false,
}: RequestOptionsSheetProps) {
  const isTv = item?.mediaType === "tv";

  const radarrServersQuery = useOverseerrRadarrServers();
  const sonarrServersQuery = useOverseerrSonarrServers();
  const serversQuery = isTv ? sonarrServersQuery : radarrServersQuery;
  const servers = serversQuery.data ?? [];

  // Seerr models 4K as separate Radarr/Sonarr servers (each flagged is4k). The
  // active quality tier picks which bucket the server/profile/root come from.
  const [is4k, setIs4k] = useState(initialIs4k);
  const servers4k = useMemo(() => servers.filter((s) => s.is4k), [servers]);
  const serversHd = useMemo(() => servers.filter((s) => !s.is4k), [servers]);
  const has4kServer = servers4k.length > 0;
  const activeServers = useMemo(
    () => (is4k ? servers4k : serversHd),
    [is4k, servers4k, serversHd],
  );

  const [serverId, setServerId] = useState<number | undefined>();

  // Reset the tier whenever a new title opens.
  useEffect(() => {
    if (visible) setIs4k(initialIs4k);
  }, [visible, item?.id, initialIs4k]);

  // Clamp the tier to what's actually configured: fall back to 4K if only 4K
  // servers exist, and off if no 4K server exists.
  useEffect(() => {
    if (is4k && !has4kServer) setIs4k(false);
    else if (!is4k && serversHd.length === 0 && servers4k.length > 0)
      setIs4k(true);
  }, [is4k, has4kServer, serversHd.length, servers4k.length]);

  useEffect(() => {
    if (activeServers.length === 0) {
      setServerId(undefined);
      return;
    }
    if (serverId !== undefined && activeServers.some((s) => s.id === serverId))
      return;
    const def = activeServers.find((s) => s.isDefault) ?? activeServers[0];
    setServerId(def?.id);
  }, [activeServers, serverId]);

  const radarrDetailsQuery = useOverseerrRadarrServerDetails(
    !isTv ? serverId : undefined,
  );
  const sonarrDetailsQuery = useOverseerrSonarrServerDetails(
    isTv ? serverId : undefined,
  );
  const detailsQuery = isTv ? sonarrDetailsQuery : radarrDetailsQuery;
  const details = detailsQuery.data;

  const [profileId, setProfileId] = useState<number | undefined>();
  const [rootFolder, setRootFolder] = useState<string | undefined>();
  const [tags, setTags] = useState<number[]>([]);
  const [seasonSelection, setSeasonSelection] = useState<"all" | number[]>("all");

  useEffect(() => {
    if (!details) return;
    setProfileId(details.server.activeProfileId);
    setRootFolder(details.server.activeDirectory);
    setTags(details.server.activeTags ?? []);
  }, [details]);

  useEffect(() => {
    if (visible) setSeasonSelection("all");
  }, [visible, item?.id]);

  const [submitError, setSubmitError] = useState<RequestError | null>(null);

  useEffect(() => {
    if (visible) setSubmitError(null);
  }, [visible, item?.id]);

  const tvDetailsQuery = useOverseerrMediaDetails(
    item?.id ?? 0,
    isTv ? "tv" : "movie",
  );
  const seasonOptions = useMemo(() => {
    if (!isTv) return [];
    const data = tvDetailsQuery.data as OverseerrTVDetails | undefined;
    return (data?.seasons ?? [])
      .filter((s) => s.seasonNumber > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber);
  }, [isTv, tvDetailsQuery.data]);

  const requestMovie = useRequestMovie();
  const requestTV = useRequestTV();

  const toggleTag = (tagId: number) => {
    setTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const toggleSeason = (seasonNumber: number) => {
    setSeasonSelection((prev) => {
      const allNumbers = seasonOptions.map((s) => s.seasonNumber);
      const current = prev === "all" ? allNumbers : prev;
      const next = current.includes(seasonNumber)
        ? current.filter((n) => n !== seasonNumber)
        : [...current, seasonNumber].sort((a, b) => a - b);
      if (next.length === 0) return [];
      if (next.length === allNumbers.length) return "all";
      return next;
    });
  };

  const seasonsValid =
    !isTv ||
    seasonSelection === "all" ||
    (Array.isArray(seasonSelection) && seasonSelection.length > 0);

  const canSubmit =
    !!item &&
    !serversQuery.isLoading &&
    !detailsQuery.isLoading &&
    seasonsValid &&
    (servers.length === 0 || (!!profileId && !!rootFolder));

  const handleSubmit = async () => {
    if (!item) return;
    setSubmitError(null);
    const baseOptions =
      servers.length > 0 ? { serverId, profileId, rootFolder, tags } : undefined;
    const options = is4k
      ? { ...(baseOptions ?? {}), is4k: true }
      : baseOptions;

    try {
      if (isTv) {
        await requestTV.mutateAsync({
          tmdbId: item.id,
          seasons: seasonSelection,
          options,
        });
      } else {
        await requestMovie.mutateAsync({ tmdbId: item.id, options });
      }
      const title = item.title || item.name || "Title";
      toast(`${title} has been requested${is4k ? " in 4K" : ""}`);
      onRequested?.();
      onClose();
    } catch (err) {
      // Surface the real Seerr error inline — toasts shown from inside this
      // Modal render behind it on Android, so the user would otherwise see
      // nothing and only get a generic "request failed" after dismissing.
      const message =
        getHttpErrorMessage(err) ??
        (err instanceof Error ? err.message : "Failed to request");
      setSubmitError({ message, copyText: formatErrorForCopy(err) });
    }
  };

  const isPending = requestMovie.isPending || requestTV.isPending;

  if (!item) return null;

  const title = item.title || item.name || "Unknown";
  const posterUrl = getPosterUrl(item.posterPath, "w185");
  const selectedFolder = details?.rootFolders.find((f) => f.path === rootFolder);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Request Options" onClose={onClose} />

        <ScrollView contentContainerClassName="px-4 py-4 pb-8">
          <View className="flex-row gap-3 mb-5">
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                className="rounded-lg bg-surface-light w-[5.7rem] h-[8.6rem]"
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                recyclingKey={posterUrl}
              />
            ) : (
              <View
                className="rounded-lg bg-surface-light items-center justify-center w-[5.7rem] h-[8.6rem]"
              >
                {isTv ? (
                  <Icon icon={Tv} size={24} color="#71717a" />
                ) : (
                  <Icon icon={Film} size={24} color="#71717a" />
                )}
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text
                className="text-zinc-100 text-base font-semibold"
                numberOfLines={2}
              >
                {title}
              </Text>
              <Text className="text-zinc-500 text-sm mt-0.5">
                {isTv ? "TV Show" : "Movie"}
              </Text>
              {item.overview ? (
                <Text className="text-zinc-500 text-xs mt-1.5" numberOfLines={3}>
                  {item.overview}
                </Text>
              ) : null}
            </View>
          </View>

          {has4kServer ? (
            <View className="rounded-xl border border-border bg-surface-light px-4 mb-4">
              <Toggle
                label="Request in 4K"
                description="Send this to your 4K Radarr/Sonarr server"
                value={is4k}
                onValueChange={setIs4k}
              />
            </View>
          ) : null}

          {servers.length === 0 ? (
            <View className="rounded-xl border border-border bg-surface-light px-4 py-3 mb-4">
              <Text className="text-zinc-300 text-sm">
                No {isTv ? "Sonarr" : "Radarr"} server is configured in Seerr.
                The request will be submitted with Seerr&apos;s defaults.
              </Text>
            </View>
          ) : null}

          {activeServers.length > 1 ? (
            <Select
              label={isTv ? "Sonarr Server" : "Radarr Server"}
              value={serverId}
              options={activeServers.map((s) => ({
                value: s.id,
                label: s.name,
                description: s.isDefault ? "Default" : undefined,
              }))}
              onChange={setServerId}
              placeholder="Select server"
              containerClassName="mb-4"
            />
          ) : null}

          {details ? (
            <>
              <Select
                label="Root Folder"
                value={rootFolder}
                options={details.rootFolders.map((f) => ({
                  value: f.path,
                  label: f.path,
                  description: `${formatBytes(f.freeSpace)} free`,
                }))}
                onChange={setRootFolder}
                placeholder="Select root folder"
                containerClassName="mb-4"
              />

              <Select
                label="Quality Profile"
                value={profileId}
                options={details.profiles.map((p) => ({
                  value: p.id,
                  label: p.name,
                }))}
                onChange={setProfileId}
                placeholder="Select quality profile"
                containerClassName="mb-4"
              />

              {details.tags.length > 0 ? (
                <View className="mb-4">
                  <Text className="text-zinc-400 text-sm mb-2">Tags</Text>
                  <View className="flex-row flex-wrap gap-2">
                    {details.tags.map((tag) => (
                      <FilterChip
                        key={tag.id}
                        label={tag.label}
                        selected={tags.includes(tag.id)}
                        onPress={() => toggleTag(tag.id)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </>
          ) : detailsQuery.isLoading ? (
            <Text className="text-zinc-500 text-sm mb-4">Loading server settings…</Text>
          ) : null}

          {isTv && seasonOptions.length > 0 ? (
            <View className="mb-2">
              <Text className="text-zinc-400 text-sm mb-2">Seasons</Text>
              <View className="flex-row flex-wrap gap-2">
                <FilterChip
                  label="All"
                  selected={seasonSelection === "all"}
                  onPress={() => setSeasonSelection("all")}
                />
                {seasonOptions.map((s) => {
                  const selected =
                    seasonSelection === "all" ||
                    (Array.isArray(seasonSelection) &&
                      seasonSelection.includes(s.seasonNumber));
                  return (
                    <FilterChip
                      key={s.id}
                      label={`S${s.seasonNumber}`}
                      selected={selected}
                      onPress={() => toggleSeason(s.seasonNumber)}
                    />
                  );
                })}
              </View>
              {!seasonsValid ? (
                <Text className="text-red-400 text-xs mt-2">
                  Select at least one season.
                </Text>
              ) : null}
            </View>
          ) : null}

          {selectedFolder ? (
            <Text className="text-zinc-600 text-xs mt-4">
              {formatBytes(selectedFolder.freeSpace)} free on{" "}
              {selectedFolder.path}
            </Text>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-6 pt-3 border-t border-border bg-background">
          <RequestErrorBanner error={submitError} className="mb-3" />
          <Button
            label={is4k ? "Send 4K Request" : "Send Request"}
            onPress={handleSubmit}
            disabled={!canSubmit}
            loading={isPending}
            icon={<Icon icon={Plus} size={16} color="#fff" />}
            size="lg"
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
