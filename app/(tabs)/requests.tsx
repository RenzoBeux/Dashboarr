import { useState } from "react";
import { View, Text, Pressable, Image, Alert } from "react-native";
import { toast } from "@/components/ui/toast";
import { Search, Check, X, Clock, Film, Tv } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useOverseerrRequests,
  useOverseerrRequestCount,
  useOverseerrSearch,
  useRequestMovie,
  useRequestTV,
  useApproveRequest,
  useDeclineRequest,
} from "@/hooks/use-overseerr";
import { getPosterUrl } from "@/services/overseerr-api";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import type { OverseerrRequest, OverseerrMediaResult } from "@/lib/types";

type Tab = "requests" | "search" | "trending";
type RequestFilter = "all" | "pending" | "approved" | "processing" | "available";

const REQUEST_STATUS_LABELS: Record<number, string> = {
  1: "Pending",
  2: "Approved",
  3: "Declined",
};

const REQUEST_STATUS_VARIANTS: Record<number, "warning" | "success" | "error"> = {
  1: "warning",
  2: "success",
  3: "error",
};

export default function RequestsScreen() {
  const [tab, setTab] = useState<Tab>("requests");
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["overseerr"]]);

  const overseerrHealth = healthData?.find((s) => s.id === "overseerr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Requests" online={overseerrHealth?.online} />

      <View className="flex-row gap-2 mb-4">
        {(["requests", "search"] as Tab[]).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            className={`px-4 py-2 rounded-full ${
              tab === t ? "bg-primary" : "bg-surface-light"
            }`}
          >
            <Text
              className={`text-sm font-medium capitalize ${
                tab === t ? "text-white" : "text-zinc-400"
              }`}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === "requests" && <RequestsList />}
      {tab === "search" && <MediaSearch />}
    </ScreenWrapper>
  );
}

function RequestsList() {
  const [filter, setFilter] = useState<RequestFilter>("all");
  const { data, isLoading } = useOverseerrRequests(1, filter);
  const { data: counts } = useOverseerrRequestCount();
  const approve = useApproveRequest();
  const decline = useDeclineRequest();

  const requests = data?.results ?? [];

  return (
    <View>
      {/* Filter chips */}
      <View className="flex-row gap-2 mb-4">
        {(["all", "pending", "approved", "processing"] as RequestFilter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full ${
              filter === f ? "bg-primary" : "bg-surface-light"
            }`}
          >
            <Text
              className={`text-xs font-medium capitalize ${
                filter === f ? "text-white" : "text-zinc-400"
              }`}
            >
              {f}
              {f === "pending" && counts?.pending ? ` (${counts.pending})` : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading ? (
        <Text className="text-zinc-500">Loading...</Text>
      ) : requests.length === 0 ? (
        <EmptyState title="No requests" message={`No ${filter} requests found`} />
      ) : (
        <View className="gap-3">
          {requests.map((req) => (
            <RequestCard
              key={req.id}
              request={req}
              onApprove={() => approve.mutate(req.id)}
              onDecline={() => decline.mutate(req.id)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function RequestCard({
  request,
  onApprove,
  onDecline,
}: {
  request: OverseerrRequest;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const isPending = request.status === 1;
  const statusLabel = REQUEST_STATUS_LABELS[request.status] ?? "Unknown";
  const statusVariant = REQUEST_STATUS_VARIANTS[request.status] ?? "default";
  const MediaIcon = request.media.mediaType === "movie" ? Film : Tv;

  return (
    <Card>
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <MediaIcon size={16} color="#a1a1aa" />
          <Text className="text-zinc-200 text-sm font-medium">
            {request.media.mediaType === "movie" ? "Movie" : "TV"} #{request.media.tmdbId}
          </Text>
        </View>
        <Badge label={statusLabel} variant={statusVariant} />
      </View>

      <Text className="text-zinc-500 text-xs mb-2">
        Requested by {request.requestedBy.displayName} ·{" "}
        {new Date(request.createdAt).toLocaleDateString()}
      </Text>

      {isPending && (
        <View className="flex-row gap-2 mt-1">
          <Pressable
            onPress={onApprove}
            className="flex-row items-center gap-1 bg-green-600/20 px-3 py-1.5 rounded-lg active:opacity-70"
          >
            <Check size={14} color="#22c55e" />
            <Text className="text-success text-xs font-medium">Approve</Text>
          </Pressable>
          <Pressable
            onPress={onDecline}
            className="flex-row items-center gap-1 bg-red-600/20 px-3 py-1.5 rounded-lg active:opacity-70"
          >
            <X size={14} color="#ef4444" />
            <Text className="text-danger text-xs font-medium">Decline</Text>
          </Pressable>
        </View>
      )}
    </Card>
  );
}

function MediaSearch() {
  const [query, setQuery] = useState("");
  const { data, isLoading } = useOverseerrSearch(query);
  const requestMovie = useRequestMovie();
  const requestTVMutation = useRequestTV();

  const results = data?.results ?? [];

  const handleRequest = (item: OverseerrMediaResult) => {
    const title = item.title || item.name || "Unknown";
    Alert.alert("Request", `Request "${title}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Request",
        onPress: () => {
          if (item.mediaType === "movie") {
            requestMovie.mutate(item.id, {
              onSuccess: () => toast(`${title} has been requested`),
              onError: () => toast("Failed to request", "error"),
            });
          } else {
            requestTVMutation.mutate(
              { tvdbId: item.id },
              {
                onSuccess: () => toast(`${title} has been requested`),
                onError: () => toast("Failed to request", "error"),
              },
            );
          }
        },
      },
    ]);
  };

  return (
    <View>
      <TextInput
        placeholder="Search movies & shows..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results.length === 0 && query.length >= 2 && !isLoading && (
        <EmptyState title="No results" />
      )}

      <View className="gap-3">
        {results.map((item) => {
          const title = item.title || item.name || "Unknown";
          const posterUrl = getPosterUrl(item.posterPath, "w185");
          const isAvailable = item.mediaInfo?.status === 5;
          const isPending = item.mediaInfo?.status === 2;

          return (
            <Card key={`${item.mediaType}-${item.id}`} className="flex-row gap-3">
              {posterUrl ? (
                <Image
                  source={{ uri: posterUrl }}
                  className="w-16 h-24 rounded-lg bg-surface-light"
                  resizeMode="cover"
                />
              ) : (
                <View className="w-16 h-24 rounded-lg bg-surface-light items-center justify-center">
                  <Film size={20} color="#71717a" />
                </View>
              )}
              <View className="flex-1 justify-center">
                <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
                  {title}
                </Text>
                <Text className="text-zinc-500 text-xs">
                  {item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4)} ·{" "}
                  {item.mediaType === "movie" ? "Movie" : "TV"}
                </Text>
                {item.overview && (
                  <Text className="text-zinc-500 text-xs mt-1" numberOfLines={2}>
                    {item.overview}
                  </Text>
                )}
              </View>
              {isAvailable ? (
                <View className="self-center p-2">
                  <Check size={20} color="#22c55e" />
                </View>
              ) : isPending ? (
                <View className="self-center p-2">
                  <Clock size={20} color="#f59e0b" />
                </View>
              ) : (
                <Pressable
                  onPress={() => handleRequest(item)}
                  className="self-center p-2 active:opacity-70"
                >
                  <Search size={20} color="#3b82f6" />
                </Pressable>
              )}
            </Card>
          );
        })}
      </View>
    </View>
  );
}
