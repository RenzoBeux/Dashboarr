import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { toast, toastError } from "@/components/ui/toast";
import { Mic2, Plus, Check, SlidersHorizontal } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useServiceImage } from "@/hooks/use-service-image";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { TextInput } from "@/components/ui/text-input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AddArtistSheet } from "@/components/lidarr/add-artist-sheet";
import {
  useLidarrSearch,
  useAddArtist,
  useLidarrArtists,
  useLidarrQualityProfiles,
  useLidarrMetadataProfiles,
  useLidarrRootFolders,
} from "@/hooks/use-lidarr";
import type { LidarrArtistSearchResult } from "@/lib/types";

export default function ArtistSearchScreen() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useLidarrSearch(query);
  const { data: existing } = useLidarrArtists();
  const [advancedTarget, setAdvancedTarget] = useState<LidarrArtistSearchResult | null>(
    null,
  );

  const existingByForeignId = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of existing ?? []) {
      map.set(a.foreignArtistId, a.id);
    }
    return map;
  }, [existing]);

  return (
    <ScreenWrapper>
      <BackHeader title="Search Artists" />

      <TextInput
        placeholder="Search for an artist..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No artists found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => {
            const existingId = existingByForeignId.get(result.foreignArtistId);
            return (
              <SearchResultCard
                key={result.foreignArtistId}
                result={result}
                existingArtistId={existingId}
                onAdvanced={() => setAdvancedTarget(result)}
                onOpenExisting={() =>
                  existingId !== undefined && router.push(`/artist/${existingId}`)
                }
              />
            );
          })}
        </View>
      )}

      <AddArtistSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}

function SearchResultCard({
  result,
  existingArtistId,
  onAdvanced,
  onOpenExisting,
}: {
  result: LidarrArtistSearchResult;
  existingArtistId: number | undefined;
  onAdvanced: () => void;
  onOpenExisting: () => void;
}) {
  const alreadyAdded = existingArtistId !== undefined;
  const addArtist = useAddArtist();
  const { data: profiles } = useLidarrQualityProfiles();
  const { data: metadataProfiles } = useLidarrMetadataProfiles();
  const { data: folders } = useLidarrRootFolders();

  const poster = result.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "lidarr");

  const handleQuickAdd = () => {
    if (!profiles?.length || !metadataProfiles?.length || !folders?.length) {
      toast("Could not load profiles or root folders", "error");
      return;
    }

    addArtist.mutate(
      {
        foreignArtistId: result.foreignArtistId,
        artistName: result.artistName,
        qualityProfileId: profiles[0].id,
        metadataProfileId: metadataProfiles[0].id,
        rootFolderPath: folders[0].path,
      },
      {
        onSuccess: () => toast(`${result.artistName} added to Lidarr`),
        onError: (err) => toastError("Failed to add artist", err),
      },
    );
  };

  const subtitle = [result.artistType, result.disambiguation]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      className="flex-row gap-3"
      onPress={alreadyAdded ? onOpenExisting : undefined}
    >
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          className="w-16 h-24 rounded-lg bg-surface-light"
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          recyclingKey={posterUrl}
          onError={onPosterError}
        />
      ) : (
        <View className="w-16 h-24 rounded-lg bg-surface-light items-center justify-center">
          <Icon icon={Mic2} size={20} color="#71717a" />
        </View>
      )}
      <View className="flex-1 justify-center">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {result.artistName}
        </Text>
        {subtitle ? (
          <Text className="text-zinc-500 text-xs">{subtitle}</Text>
        ) : null}
        {result.overview && (
          <Text className="text-zinc-500 text-xs mt-1" numberOfLines={2}>
            {result.overview}
          </Text>
        )}
      </View>
      {alreadyAdded ? (
        <View className="self-center p-2">
          <Icon icon={Check} size={20} color="#22c55e" />
        </View>
      ) : (
        <View className="flex-row items-center self-center">
          <Pressable onPress={onAdvanced} className="p-2 active:opacity-70" hitSlop={4}>
            <Icon icon={SlidersHorizontal} size={18} color="#a1a1aa" />
          </Pressable>
          <Pressable
            onPress={handleQuickAdd}
            className="p-2 active:opacity-70"
            disabled={addArtist.isPending}
            hitSlop={4}
          >
            <Icon icon={Plus} size={20} color="#3b82f6" />
          </Pressable>
        </View>
      )}
    </Card>
  );
}
