import { useState } from "react";
import { View, Text } from "react-native";
import { Image } from "expo-image";
import { UserRound } from "lucide-react-native";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { useConfigStore } from "@/store/config-store";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useOverseerrMediaDetails } from "@/hooks/use-overseerr";
import { useSeerrCapabilities } from "@/hooks/use-seerr-capabilities";
import {
  collectSeerrRequesters,
  seerrAvatarUrl,
  seerrInitials,
  type SeerrRequester,
} from "@/lib/seerr-requesters";
import { formatTimeAgo } from "@/lib/utils";
import type { OverseerrMediaType } from "@/lib/types";

/**
 * "Requested by" on the Radarr movie / Sonarr series detail screens (#378).
 *
 * The match is by TMDB id: `GET /movie/{tmdbId}` and `GET /tv/{tmdbId}` return
 * `mediaInfo.requests` with an eager `requestedBy` on every row, so one call
 * answers "who asked for this" without scanning `/request` pages. Radarr always
 * carries `tmdbId`; Sonarr only since 4.0.5 and only after a metadata refresh,
 * so `tmdbId` is optional there and the block simply stays hidden without one.
 *
 * It renders NOTHING — no spinner, no error, no empty state — unless there is
 * a requester to name. A title added by hand, a Seerr that is down, a workspace
 * with no Seerr attached and a still-loading fetch all look the same from the
 * screen's point of view, which is what the issue asked for: hide, don't error.
 *
 * Gated on `canViewAllRequests`, matching the requests list and the dashboard
 * card. The details route hands back every request regardless of the caller's
 * permissions (unlike `GET /request`, which self-scopes), and Seerr's own web
 * UI only shows the requester behind its manage slide-over, so showing it to a
 * signed-in non-manager would leak more than upstream does. In API-key mode the
 * account is the admin, so nothing is hidden in the common setup.
 */
export function RequestedByBlock({
  tmdbId,
  mediaType,
  className = "",
}: {
  tmdbId: number | undefined;
  mediaType: OverseerrMediaType;
  className?: string;
}) {
  const { instanceId, enabled } = useInstanceTarget("overseerr");
  const hasTmdbId = !!tmdbId && tmdbId > 0;
  const active = enabled && !!instanceId && hasTmdbId;
  const caps = useSeerrCapabilities(instanceId ?? undefined, active);
  const { data } = useOverseerrMediaDetails(
    tmdbId ?? 0,
    mediaType,
    instanceId ?? undefined,
    active && caps.canViewAllRequests,
  );
  // Only the avatar host; the request itself goes through serviceRequest.
  // getActiveUrl is what enforces the local-vs-remote rule, so an avatar can
  // never reach for a LAN address while away from the home network.
  const baseUrl = useConfigStore((s) =>
    instanceId ? s.getActiveUrl("overseerr", instanceId) : "",
  );

  const requesters = collectSeerrRequesters(data?.mediaInfo?.requests);
  if (!active || !caps.canViewAllRequests || requesters.length === 0) return null;

  return (
    <View className={`mb-5 ${className}`}>
      <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
        Requested by
      </Text>
      <View className="rounded-2xl bg-surface border border-border p-4 gap-3">
        {requesters.map((requester) => (
          <RequesterRow
            key={requester.userId}
            requester={requester}
            baseUrl={baseUrl}
          />
        ))}
      </View>
    </View>
  );
}

function RequesterRow({
  requester,
  baseUrl,
}: {
  requester: SeerrRequester;
  baseUrl: string;
}) {
  const requestedAt = formatTimeAgo(requester.requestedAt);
  const avatarUri = seerrAvatarUrl(requester.avatar, baseUrl);
  return (
    <View className="flex-row items-center gap-3">
      {/* Keyed on the URL so a local↔remote switch retries an avatar that
          failed against the other host instead of staying on the initials. */}
      <RequesterAvatar
        key={avatarUri ?? "initials"}
        displayName={requester.displayName}
        uri={avatarUri}
      />
      <Text className="text-zinc-200 text-sm font-medium flex-1" numberOfLines={1}>
        {requester.displayName}
      </Text>
      {requester.only4k ? <Badge label="4K" /> : null}
      {requestedAt ? (
        <Text className="text-zinc-500 text-xs">{requestedAt}</Text>
      ) : null}
    </View>
  );
}

function RequesterAvatar({
  displayName,
  uri,
}: {
  displayName: string;
  uri: string | undefined;
}) {
  const [failed, setFailed] = useState(false);

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        className="w-8 h-8 rounded-full bg-surface-light"
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        recyclingKey={uri}
        onError={() => setFailed(true)}
      />
    );
  }

  const initials = seerrInitials(displayName);
  return (
    <View className="w-8 h-8 rounded-full bg-surface-light items-center justify-center">
      {initials === "?" ? (
        <Icon icon={UserRound} size={16} color="#71717a" />
      ) : (
        <Text className="text-zinc-400 text-xs font-semibold">{initials}</Text>
      )}
    </View>
  );
}
