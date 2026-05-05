import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { Inbox, Check, Clock, X, type LucideIcon } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useOverseerrRequests,
  useOverseerrRequestCount,
  useOverseerrMediaDetails,
} from "@/hooks/use-overseerr";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { getPosterUrl } from "@/services/overseerr-api";
import type { OverseerrRequest } from "@/lib/types";
import {
  OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  type OverseerrRequestsSettingsValue,
  type OverseerrStatusFilter,
} from "@/components/dashboard/widget-settings/overseerr-requests-settings";
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

export function OverseerrRequestsCard() {
  const { settings } = useWidgetSettings<OverseerrRequestsSettingsValue>(
    "overseerr-requests",
    OVERSEERR_REQUESTS_DEFAULT_SETTINGS,
  );
  const { data, isLoading } = useOverseerrRequests(1, apiFilterFor(settings.statusFilter));
  const { data: counts } = useOverseerrRequestCount();
  const router = useRouter();

  const allResults = data?.results ?? [];
  const filtered = allResults.filter((req) => statusMatches(req.status, settings.statusFilter));
  const display = filtered.slice(0, settings.maxItems);

  const goToRequests = () => router.push("/(tabs)/requests?tab=requests");

  return (
    <Card>
      <CardHeaderLink
        title="Requests"
        onPress={goToRequests}
        trailing={
          counts && counts.pending > 0 ? (
            <Badge label="Pending" variant="warning" count={counts.pending} />
          ) : null
        }
      />

      {isLoading ? (
        <PosterSkeletonRow count={4} />
      ) : display.length === 0 ? (
        <EmptyState
          icon={<Inbox size={32} color="#71717a" />}
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
          {display.map((req) => (
            <RequestPosterCard
              key={req.id}
              request={req}
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
  showRequester,
  onPress,
}: {
  request: OverseerrRequest;
  showRequester: boolean;
  onPress: () => void;
}) {
  const Icon = REQUEST_STATUS_ICON[request.status] ?? Clock;
  const statusBg = REQUEST_STATUS_BG[request.status] ?? "#71717a";

  const { data: mediaDetails } = useOverseerrMediaDetails(
    request.media.tmdbId,
    request.media.mediaType,
  );

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
      cornerBadge={{ icon: Icon, color: statusBg }}
      mediaType={request.media.mediaType === "movie" ? "movie" : "tv"}
      onPress={onPress}
    />
  );
}

