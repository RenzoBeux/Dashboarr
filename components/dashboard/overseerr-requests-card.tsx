import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { useRouter } from "expo-router";
import { Inbox, Check, Clock, X, ChevronRight, Film, Tv } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
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

const REQUEST_STATUS_ICON: Record<number, React.ElementType> = {
  1: Clock, // pending
  2: Check, // approved
  3: X, // declined
};

const REQUEST_STATUS_BG: Record<number, string> = {
  1: "#f59e0b",
  2: "#22c55e",
  3: "#ef4444",
};

const POSTER_WIDTH = 110;
const POSTER_HEIGHT = 165;

// Maps the widget setting to the API filter argument. "pending-approved" needs
// client-side filtering so we fetch "all" and trim down below.
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
      <CardHeader>
        <Pressable
          onPress={goToRequests}
          className="flex-row items-center gap-1 active:opacity-70"
          hitSlop={8}
        >
          <CardTitle>Requests</CardTitle>
          <ChevronRight size={18} color="#a1a1aa" />
        </Pressable>
        <View className="flex-row gap-2">
          {counts && counts.pending > 0 && (
            <Badge label="Pending" variant="warning" count={counts.pending} />
          )}
        </View>
      </CardHeader>

      {isLoading ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {Array.from({ length: 4 }).map((_, i) => (
            <View key={i} style={{ width: POSTER_WIDTH }}>
              <Skeleton
                width={POSTER_WIDTH}
                height={POSTER_HEIGHT}
                borderRadius={12}
              />
              <View className="mt-2">
                <Skeleton width={90} height={12} borderRadius={4} />
              </View>
            </View>
          ))}
        </ScrollView>
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
            <Pressable
              onPress={goToRequests}
              className="items-center justify-center active:opacity-70"
              style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}
            >
              <View className="items-center justify-center bg-surface-light rounded-xl border border-border w-full h-full gap-1.5">
                <ChevronRight size={28} color="#a1a1aa" />
                <Text className="text-zinc-300 text-xs font-medium">
                  View all
                </Text>
              </View>
            </Pressable>
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
    <Pressable
      onPress={onPress}
      className="active:opacity-80"
      style={{ width: POSTER_WIDTH }}
    >
      <View
        className="rounded-xl overflow-hidden bg-surface-light"
        style={{ width: POSTER_WIDTH, height: POSTER_HEIGHT }}
      >
        {posterUrl ? (
          <Image
            source={{ uri: posterUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
        ) : (
          <View className="w-full h-full items-center justify-center">
            {request.media.mediaType === "movie" ? (
              <Film size={24} color="#71717a" />
            ) : (
              <Tv size={24} color="#71717a" />
            )}
          </View>
        )}

        <View
          className="absolute top-1.5 right-1.5 rounded-full p-1"
          style={{ backgroundColor: statusBg }}
        >
          <Icon size={10} color="#fff" />
        </View>
      </View>

      <Text
        className="text-zinc-200 text-xs font-medium mt-1.5"
        numberOfLines={2}
      >
        {title}
      </Text>
      {showRequester && (
        <Text className="text-zinc-500 text-[11px]" numberOfLines={1}>
          {request.requestedBy.displayName}
        </Text>
      )}
    </Pressable>
  );
}
