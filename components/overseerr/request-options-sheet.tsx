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
  useOverseerrUsers,
} from "@/hooks/use-overseerr";
import type { OverseerrMediaResult, OverseerrTVDetails } from "@/lib/types";
import { formatBytes } from "@/lib/utils";
import { useModalClosed } from "@/hooks/use-modal-closed";
import { useTargetInstance } from "@/hooks/use-instance-target";
import { useSeerrCapabilities } from "@/hooks/use-seerr-capabilities";
import { canRequest4kMedia } from "@/lib/seerr-permissions";
import { SeerrPermissionNotice } from "@/components/overseerr/seerr-permission-notice";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";

// Matches components/settings/seerr-request-user-card.tsx: Seerr user ids are
// auto-increment and always >= 1, so a negative sentinel means "no override".
const API_KEY_OWNER_ID = -1;

interface RequestOptionsSheetProps {
  item: OverseerrMediaResult | null;
  visible: boolean;
  onClose: () => void;
  onRequested?: () => void;
  /**
   * Fired once this sheet's Modal is fully dismissed (see `useModalClosed`).
   * The parent MediaDetailModal uses it to dismiss itself only after this
   * nested pageSheet is gone — dismissing both in the same tick races the
   * child's teardown on iOS (issue #83 class).
   */
  onClosed?: () => void;
  // Preselect the 4K quality tier (e.g. when opened from a "Request 4K" action).
  initialIs4k?: boolean;
}

export function RequestOptionsSheet({
  item,
  visible,
  onClose,
  onRequested,
  onClosed,
  initialIs4k = false,
}: RequestOptionsSheetProps) {
  const isTv = item?.mediaType === "tv";
  // Fire onClosed once the Modal is fully gone — the safe point for the
  // parent to start its own dismissal on iOS.
  const handleDismiss = useModalClosed(visible, onClosed);
  const footerPadding = useSheetBottomPadding();

  const radarrServersQuery = useOverseerrRadarrServers();
  const sonarrServersQuery = useOverseerrSonarrServers();
  const serversQuery = isTv ? sonarrServersQuery : radarrServersQuery;
  const servers = serversQuery.data ?? [];

  // Permission gates (#332). Server, profile, root folder and tags are only
  // honoured by Seerr for accounts with MANAGE_REQUESTS; for anyone else the
  // server discards them and applies the account's defaults, so the pickers
  // are hidden rather than rendered as decoration. The 4K tier needs its own
  // request permission.
  const caps = useSeerrCapabilities();
  const canManage = caps.loaded && caps.canManageRequests;
  const may4k = caps.loaded && canRequest4kMedia(caps, isTv ? "tv" : "movie");

  // Seerr models 4K as separate Radarr/Sonarr servers (each flagged is4k). The
  // active quality tier picks which bucket the server/profile/root come from.
  const [is4k, setIs4k] = useState(initialIs4k);
  const servers4k = useMemo(() => servers.filter((s) => s.is4k), [servers]);
  const serversHd = useMemo(() => servers.filter((s) => !s.is4k), [servers]);
  // "No permission" behaves exactly like "no 4K server": the toggle hides and
  // the tier clamp below keeps is4k off.
  const has4kServer = servers4k.length > 0 && may4k;
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
  // Both branches key on has4kServer, which already folds in the 4K request
  // permission: on a 4K-only setup a user WITHOUT that permission would
  // otherwise be flipped off by the first branch and back on by the second,
  // forever.
  useEffect(() => {
    if (is4k && !has4kServer) setIs4k(false);
    else if (!is4k && has4kServer && serversHd.length === 0) setIs4k(true);
  }, [is4k, has4kServer, serversHd.length]);

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
    !isTv && canManage ? serverId : undefined,
  );
  const sonarrDetailsQuery = useOverseerrSonarrServerDetails(
    isTv && canManage ? serverId : undefined,
  );
  const detailsQuery = isTv ? sonarrDetailsQuery : radarrDetailsQuery;
  const details = detailsQuery.data;

  const [profileId, setProfileId] = useState<number | undefined>();
  const [rootFolder, setRootFolder] = useState<string | undefined>();
  const [tags, setTags] = useState<number[]>([]);
  const [seasonSelection, setSeasonSelection] = useState<"all" | number[]>("all");

  // "Request As" (#332): per-request override of the account the request is
  // attributed to. Seeded from the instance's stored default so the picker
  // always shows what will actually happen, and re-seeded on every open so a
  // one-off override never leaks into the next title.
  const storedRequestAsUserId = useTargetInstance("overseerr")?.requestAsUserId;
  const usersQuery = useOverseerrUsers(undefined, caps.canRequestAs);
  const users = usersQuery.data?.results ?? [];
  const [requestAsUserId, setRequestAsUserId] = useState<number | undefined>(
    storedRequestAsUserId,
  );
  useEffect(() => {
    if (visible) setRequestAsUserId(storedRequestAsUserId);
  }, [visible, item?.id, storedRequestAsUserId]);

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
    caps.loaded &&
    !serversQuery.isLoading &&
    !detailsQuery.isLoading &&
    seasonsValid &&
    (!canManage || servers.length === 0 || (!!profileId && !!rootFolder));

  const handleSubmit = async () => {
    if (!item) return;
    setSubmitError(null);
    const baseOptions =
      canManage && servers.length > 0
        ? { serverId, profileId, rootFolder, tags }
        : undefined;
    const with4k = is4k ? { ...(baseOptions ?? {}), is4k: true } : baseOptions;
    // Always set the key, even when the value is undefined: this sheet owns the
    // choice, and an absent key would let the instance's stored default win
    // (see resolveRequestUser in lib/overseerr-request-user.ts), making the
    // picker's "API key owner" option a no-op. An account that cannot request
    // on behalf of another sends no key at all; the hook's fallback is gated
    // on the same capability.
    const options = caps.canRequestAs
      ? { ...(with4k ?? {}), userId: requestAsUserId }
      : with4k;

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
      onDismiss={handleDismiss}
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

          {users.length > 1 && caps.canRequestAs ? (
            <Select<number>
              label="Request As"
              value={requestAsUserId ?? API_KEY_OWNER_ID}
              options={[
                {
                  value: API_KEY_OWNER_ID,
                  label: "API key owner",
                  description: "Attribute this request to the admin account",
                },
                ...users.map((u) => ({ value: u.id, label: u.displayName })),
              ]}
              onChange={(v) =>
                setRequestAsUserId(v === API_KEY_OWNER_ID ? undefined : v)
              }
              containerClassName="mb-4"
            />
          ) : null}

          {caps.loaded && !caps.canManageRequests ? (
            <SeerrPermissionNotice
              className="mb-4"
              message="Server, quality profile and folder are chosen by your Seerr admin's defaults for your account."
            />
          ) : null}
          {!caps.loaded && caps.error ? (
            <SeerrPermissionNotice
              className="mb-4"
              message={`Couldn't check your Seerr account: ${caps.error.message}`}
            />
          ) : null}

          {canManage && servers.length === 0 ? (
            <View className="rounded-xl border border-border bg-surface-light px-4 py-3 mb-4">
              <Text className="text-zinc-300 text-sm">
                No {isTv ? "Sonarr" : "Radarr"} server is configured in Seerr.
                The request will be submitted with Seerr&apos;s defaults.
              </Text>
            </View>
          ) : null}

          {canManage && activeServers.length > 1 ? (
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

          {canManage && details ? (
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
          ) : canManage && detailsQuery.isLoading ? (
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

        <View
          className="px-4 pb-6 pt-3 border-t border-border bg-background"
          style={footerPadding}
        >
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
