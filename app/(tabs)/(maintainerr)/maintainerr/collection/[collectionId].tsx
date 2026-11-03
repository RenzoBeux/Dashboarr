import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { ShieldCheck } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ErrorBanner } from "@/components/common/error-banner";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { toast, toastError } from "@/components/ui/toast";
import {
  useExcludeMaintainerrMedia,
  useMaintainerrCollectionMedia,
  useMaintainerrCollections,
} from "@/hooks/use-maintainerr";
import { lightHaptic } from "@/lib/haptics";
import { formatBytes, relativeDate } from "@/lib/utils";
import { maintainerrActionDate } from "@/services/maintainerr-api";
import type { MaintainerrCollection, MaintainerrCollectionMedia } from "@/lib/types";

export default function MaintainerrCollectionScreen() {
  const { collectionId } = useLocalSearchParams<{ collectionId: string }>();
  const id = Number(collectionId);
  const { refreshing, onRefresh } = usePullToRefresh([["maintainerr"]]);
  const { data: collections } = useMaintainerrCollections();
  const collection = collections?.find((c) => c.id === id);

  const { data, isLoading, error, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useMaintainerrCollectionMedia(id);
  const items = data?.pages.flatMap((p) => p.items) ?? [];
  const total = data?.pages[0]?.totalSize;

  // Target and visibility are separate so the modal's message doesn't flash to
  // the fallback while it fades out after confirm/cancel.
  const [confirmTarget, setConfirmTarget] = useState<MaintainerrCollectionMedia | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const exclude = useExcludeMaintainerrMedia();

  const confirmExclude = () => {
    const target = confirmTarget;
    setConfirmVisible(false);
    if (!target) return;
    const title = mediaTitle(target);
    exclude.mutate(
      { collectionId: id, mediaServerId: target.mediaServerId },
      {
        onSuccess: () => toast(`${title} excluded`),
        onError: (err) => toastError(`Couldn't exclude ${title}`, err),
      },
    );
  };

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <BackHeader title={collection?.title ?? "Collection"} />

      <Card>
        <CardHeader>
          <CardTitle>Media</CardTitle>
          {total != null ? <Text className="text-zinc-500 text-xs tabular-nums">{total}</Text> : null}
        </CardHeader>

        {isLoading ? (
          <SkeletonCardContent rows={4} />
        ) : error && items.length === 0 ? (
          <ErrorBanner error={error} title="Couldn't load this collection" />
        ) : items.length === 0 ? (
          <EmptyState compact title="Nothing in this collection" />
        ) : (
          <View className="gap-3">
            {items.map((item) => (
              <MediaRow
                key={item.id}
                item={item}
                collection={collection}
                busy={exclude.isPending && exclude.variables?.mediaServerId === item.mediaServerId}
                onExclude={() => {
                  setConfirmTarget(item);
                  setConfirmVisible(true);
                }}
              />
            ))}

            {hasNextPage && (
              <Pressable
                onPress={() => {
                  lightHaptic();
                  fetchNextPage();
                }}
                disabled={isFetchingNextPage}
                className="items-center py-2 active:opacity-70"
              >
                {isFetchingNextPage ? (
                  <Spinner size={18} />
                ) : (
                  <Text className="text-primary text-sm font-medium">Load more</Text>
                )}
              </Pressable>
            )}
          </View>
        )}
      </Card>

      <ConfirmModal
        visible={confirmVisible}
        title="Exclude from collection"
        message={`Keep ${confirmTarget ? mediaTitle(confirmTarget) : "this item"} out of ${
          collection?.title ?? "this collection"
        }? Maintainerr removes it now and the collection's rules skip it from then on.`}
        icon={ShieldCheck}
        confirmLabel="Exclude"
        onConfirm={confirmExclude}
        onCancel={() => setConfirmVisible(false)}
      />
    </ScreenWrapper>
  );
}

function mediaTitle(item: MaintainerrCollectionMedia): string {
  const title = item.mediaData?.title;
  if (!title) return "this item";
  return item.mediaData?.year ? `${title} (${item.mediaData.year})` : title;
}

function MediaRow({
  item,
  collection,
  busy,
  onExclude,
}: {
  item: MaintainerrCollectionMedia;
  collection: MaintainerrCollection | undefined;
  busy: boolean;
  onExclude: () => void;
}) {
  // When the worker acts on this item; what it does is already on the
  // collection row, so the date alone is shown ("Scheduled", the Overview's word).
  const actionDate = collection
    ? maintainerrActionDate(item.addDate, collection.arrAction, collection.deleteAfterDays)
    : null;
  const details = [
    actionDate ? `Scheduled ${relativeDate(actionDate.toISOString())}` : null,
    item.sizeBytes ? formatBytes(item.sizeBytes) : null,
  ].filter(Boolean);

  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-1 gap-0.5">
        <Text className="text-zinc-100 text-sm font-medium" numberOfLines={1}>
          {item.mediaData?.title ?? `Item ${item.mediaServerId}`}
          {item.mediaData?.year ? <Text className="text-zinc-500 font-normal"> ({item.mediaData.year})</Text> : null}
        </Text>
        {details.length > 0 ? (
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {details.join(" · ")}
          </Text>
        ) : null}
      </View>
      <Pressable
        onPress={onExclude}
        disabled={busy}
        hitSlop={6}
        className="flex-row items-center gap-1.5 rounded-lg bg-zinc-800 px-3 py-1.5 active:opacity-70"
      >
        {busy ? <Spinner size={14} /> : <Icon icon={ShieldCheck} size={14} color="#a1a1aa" />}
        <Text className="text-zinc-200 text-xs font-medium">Exclude</Text>
      </Pressable>
    </View>
  );
}
