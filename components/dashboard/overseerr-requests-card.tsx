import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Check, Clock, X, type LucideIcon } from "lucide-react-native";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getRequests,
  getRequestCount,
  getMovieDetails,
  getTVDetails,
  getPosterUrl,
} from "@/services/overseerr-api";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useHideWhenEmpty } from "@/hooks/use-hide-when-empty";
import { useWorkspaceScopedInstances } from "@/hooks/use-workspace-instances";
import { POLLING_INTERVALS } from "@/lib/constants";
import type {
  OverseerrRequest,
  OverseerrMovieDetails,
  OverseerrTVDetails,
  OverseerrMediaType,
} from "@/lib/types";
import {
  OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  type OverseerrRequestsSettingsValue,
  type OverseerrStatusFilter,
} from "@/components/dashboard/widget-settings/overseerr-requests-settings";
import { aggregateMultiInstanceState } from "@/lib/multi-instance-query";
import type { WidgetComponentProps } from "@/components/dashboard/widget-registry";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { CardHeaderLink } from "@/components/dashboard/card-header-link";
import { ViewAllTile } from "@/components/dashboard/view-all-tile";

const REQUEST_STATUS_ICON: Record<number, LucideIcon> = {
  1: Clock,
  2: Check,
  3: X,
};

const REQUEST_STATUS_BG: Record<number, string> = {
  1: "#f59e0b",
  2: "#22c55e",
  3: "#ef4444",
};

function apiFilterFor(filter: OverseerrStatusFilter): "pending" | undefined {
  return filter === "pending" ? "pending" : undefined;
}

function statusMatches(status: number, filter: OverseerrStatusFilter): boolean {
  switch (filter) {
    case "pending":
      return status === 1;
    case "pending-approved":
      return status === 1 || status === 2;
    case "all":
      return true;
  }
}

export function OverseerrRequestsCard({ slotId }: WidgetComponentProps) {
  const { settings } = useWidgetSettings<OverseerrRequestsSettingsValue>(
    slotId,
    OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  );
  const instances = useWorkspaceScopedInstances("overseerr", settings.instanceIds);
  const router = useRouter();

  // Fan out requests + counts across the resolved instances. Each request is
  // tagged with its source instance so per-tile media-detail lookups hit the
  // right Seerr (TMDB ids are global but the auth + base URL aren't).
  const requestQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: [
        "overseerr",
        inst.id,
        "requests",
        1,
        apiFilterFor(settings.statusFilter),
      ] as const,
      queryFn: () => getRequests(1, 20, apiFilterFor(settings.statusFilter), "added", inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  const countQueries = useQueries({
    queries: instances.map((inst) => ({
      queryKey: ["overseerr", inst.id, "requestCount"] as const,
      queryFn: () => getRequestCount(inst.id),
      refetchInterval: POLLING_INTERVALS.queue,
    })),
  });

  // Initial-load gate only on the request queries — see lib/multi-instance-query.ts.
  // The pending-count summary just contributes 0 from a failing instance.
  const { isInitialLoading } = aggregateMultiInstanceState(requestQueries);
  const allResults = requestQueries.flatMap((q, i) =>
    (q.data?.results ?? []).map((req) => ({ request: req, instanceId: instances[i].id })),
  );
  const filtered = allResults.filter(({ request }) =>
    statusMatches(request.status, settings.statusFilter),
  );
  const display = filtered.slice(0, settings.maxItems);
  const pendingCount = countQueries.reduce(
    (acc, q) => acc + (q.data?.pending ?? 0),
    0,
  );

  const goToRequests = () => router.push("/(tabs)/requests?tab=requests");

  useHideWhenEmpty(slotId, {
    enabled: settings.hideWhenEmpty,
    isEmpty: instances.length === 0 || filtered.length === 0,
    isLoading: isInitialLoading,
  });

  return (
    <Card>
      <CardHeaderLink
        title="Requests"
        onPress={goToRequests}
        trailing={
          pendingCount > 0 ? (
            <Badge label="Pending" variant="warning" count={pendingCount} />
          ) : null
        }
      />

      {instances.length === 0 ? (
        <EmptyState compact title="No Seerr instances enabled" />
      ) : isInitialLoading ? (
        <PosterSkeletonRow count={4} />
      ) : display.length === 0 ? (
        <EmptyState
          compact
          title={
            settings.statusFilter === "pending"
              ? "No pending requests"
              : "No requests"
          }
        />
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {display.map(({ request, instanceId }) => (
            <RequestPosterCard
              key={`${instanceId}:${request.id}`}
              request={request}
              instanceId={instanceId}
              showRequester={settings.showRequester}
              onPress={goToRequests}
            />
          ))}
          {filtered.length > settings.maxItems && (
            <ViewAllTile onPress={goToRequests} />
          )}
        </ScrollView>
      )}
    </Card>
  );
}

function RequestPosterCard({
  request,
  instanceId,
  showRequester,
  onPress,
}: {
  request: OverseerrRequest;
  instanceId: string;
  showRequester: boolean;
  onPress: () => void;
}) {
  const StatusIcon = REQUEST_STATUS_ICON[request.status] ?? Clock;
  const statusBg = REQUEST_STATUS_BG[request.status] ?? "#71717a";

  // Each Seerr maintains its own metadata so the media-detail call must hit
  // the same instance the request came from. Using useQuery directly here so
  // the per-tile binding doesn't require a hook variant.
  const { data: mediaDetails } = useQuery<OverseerrMovieDetails | OverseerrTVDetails>({
    queryKey: [
      "overseerr",
      instanceId,
      "mediaDetails",
      request.media.mediaType as OverseerrMediaType,
      request.media.tmdbId,
    ],
    queryFn: () =>
      request.media.mediaType === "movie"
        ? getMovieDetails(request.media.tmdbId, instanceId)
        : getTVDetails(request.media.tmdbId, instanceId),
    staleTime: 60 * 60 * 1000,
  });

  const details = mediaDetails as
    | { title?: string; name?: string; posterPath?: string }
    | undefined;
  const title =
    details?.title ||
    details?.name ||
    `${request.media.mediaType === "movie" ? "Movie" : "TV"} #${request.media.tmdbId}`;
  const posterUrl = getPosterUrl(details?.posterPath, "w185");

  return (
    <MediaPosterTile
      posterUrl={posterUrl}
      title={title}
      subtitle={showRequester ? request.requestedBy.displayName : undefined}
      cornerBadge={{ icon: StatusIcon, color: statusBg }}
      mediaType={request.media.mediaType === "movie" ? "movie" : "tv"}
      onPress={onPress}
    />
  );
}
