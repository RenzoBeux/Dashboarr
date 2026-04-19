import { useMemo, useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { toast } from "@/components/ui/toast";
import { useRouter } from "expo-router";
import { Tv, Plus, Check, SlidersHorizontal } from "lucide-react-native";
import { useServiceImage } from "@/hooks/use-service-image";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { TextInput } from "@/components/ui/text-input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AddSeriesSheet } from "@/components/sonarr/add-series-sheet";
import {
  useSonarrSearch,
  useAddSeries,
  useSonarrSeries,
  useSonarrQualityProfiles,
  useSonarrRootFolders,
} from "@/hooks/use-sonarr";
import type { SonarrSearchResult } from "@/lib/types";

export default function SeriesSearchScreen() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useSonarrSearch(query);
  const { data: existing } = useSonarrSeries();
  const router = useRouter();
  const [advancedTarget, setAdvancedTarget] = useState<SonarrSearchResult | null>(null);

  const existingTvdbIds = useMemo(
    () => new Set(existing?.map((s) => s.tvdbId) ?? []),
    [existing],
  );

  return (
    <ScreenWrapper>
      <View className="flex-row items-center mb-4 mt-2">
        <Pressable onPress={() => router.back()} className="mr-3 active:opacity-70">
          <Text className="text-primary text-base">← Back</Text>
        </Pressable>
        <Text className="text-zinc-100 text-xl font-bold">Search TV Shows</Text>
      </View>

      <TextInput
        placeholder="Search for a show..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No shows found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => (
            <SearchResultCard
              key={result.tvdbId}
              result={result}
              alreadyAdded={existingTvdbIds.has(result.tvdbId)}
              onAdvanced={() => setAdvancedTarget(result)}
            />
          ))}
        </View>
      )}

      <AddSeriesSheet
        result={advancedTarget}
        visible={advancedTarget !== null}
        onClose={() => setAdvancedTarget(null)}
      />
    </ScreenWrapper>
  );
}

function SearchResultCard({
  result,
  alreadyAdded,
  onAdvanced,
}: {
  result: SonarrSearchResult;
  alreadyAdded: boolean;
  onAdvanced: () => void;
}) {
  const addSeries = useAddSeries();
  const { data: profiles } = useSonarrQualityProfiles();
  const { data: folders } = useSonarrRootFolders();

  const poster = result.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "sonarr");

  const handleQuickAdd = () => {
    if (!profiles?.length || !folders?.length) {
      toast("Could not load quality profiles or root folders", "error");
      return;
    }

    addSeries.mutate(
      {
        tvdbId: result.tvdbId,
        title: result.title,
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
      },
      {
        onSuccess: () => toast(`${result.title} added to Sonarr`),
        onError: () => toast("Failed to add series", "error"),
      },
    );
  };

  return (
    <Card className="flex-row gap-3">
      {posterUrl ? (
        <Image
          source={{ uri: posterUrl }}
          className="w-16 h-24 rounded-lg bg-surface-light"
          resizeMode="cover"
          onError={onPosterError}
        />
      ) : (
        <View className="w-16 h-24 rounded-lg bg-surface-light items-center justify-center">
          <Tv size={20} color="#71717a" />
        </View>
      )}
      <View className="flex-1 justify-center">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {result.title}
        </Text>
        <Text className="text-zinc-500 text-xs">
          {[
            result.year,
            result.network,
            `${result.seasonCount} season${result.seasonCount !== 1 ? "s" : ""}`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        {result.overview && (
          <Text className="text-zinc-500 text-xs mt-1" numberOfLines={2}>
            {result.overview}
          </Text>
        )}
      </View>
      {alreadyAdded ? (
        <View className="self-center p-2">
          <Check size={20} color="#22c55e" />
        </View>
      ) : (
        <View className="flex-row items-center self-center">
          <Pressable
            onPress={onAdvanced}
            className="p-2 active:opacity-70"
            hitSlop={4}
          >
            <SlidersHorizontal size={18} color="#a1a1aa" />
          </Pressable>
          <Pressable
            onPress={handleQuickAdd}
            className="p-2 active:opacity-70"
            disabled={addSeries.isPending}
            hitSlop={4}
          >
            <Plus size={20} color="#3b82f6" />
          </Pressable>
        </View>
      )}
    </Card>
  );
}
