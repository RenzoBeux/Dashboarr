import { useMemo, useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import { toast } from "@/components/ui/toast";
import { useRouter } from "expo-router";
import { Film, Plus, Check, SlidersHorizontal } from "lucide-react-native";
import { useServiceImage } from "@/hooks/use-service-image";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { TextInput } from "@/components/ui/text-input";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AddMovieSheet } from "@/components/radarr/add-movie-sheet";
import {
  useRadarrSearch,
  useAddMovie,
  useRadarrMovies,
  useRadarrQualityProfiles,
  useRadarrRootFolders,
} from "@/hooks/use-radarr";
import type { RadarrSearchResult } from "@/lib/types";

export default function MovieSearchScreen() {
  const [query, setQuery] = useState("");
  const { data: results, isLoading } = useRadarrSearch(query);
  const { data: existing } = useRadarrMovies();
  const router = useRouter();
  const [advancedTarget, setAdvancedTarget] = useState<RadarrSearchResult | null>(null);

  const existingTmdbIds = useMemo(
    () => new Set(existing?.map((m) => m.tmdbId) ?? []),
    [existing],
  );

  return (
    <ScreenWrapper>
      <View className="flex-row items-center mb-4 mt-2">
        <Pressable onPress={() => router.back()} className="mr-3 active:opacity-70">
          <Text className="text-primary text-base">← Back</Text>
        </Pressable>
        <Text className="text-zinc-100 text-xl font-bold">Search Movies</Text>
      </View>

      <TextInput
        placeholder="Search for a movie..."
        value={query}
        onChangeText={setQuery}
        autoFocus
        containerClassName="mb-4"
      />

      {isLoading && <Text className="text-zinc-500">Searching...</Text>}

      {results && results.length === 0 && query.length >= 2 && (
        <EmptyState title="No results" message={`No movies found for "${query}"`} />
      )}

      {results && results.length > 0 && (
        <View className="gap-3">
          {results.map((result) => (
            <SearchResultCard
              key={result.tmdbId}
              result={result}
              alreadyAdded={existingTmdbIds.has(result.tmdbId)}
              onAdvanced={() => setAdvancedTarget(result)}
            />
          ))}
        </View>
      )}

      <AddMovieSheet
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
  result: RadarrSearchResult;
  alreadyAdded: boolean;
  onAdvanced: () => void;
}) {
  const addMovie = useAddMovie();
  const { data: profiles } = useRadarrQualityProfiles();
  const { data: folders } = useRadarrRootFolders();

  const poster = result.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "radarr");

  const handleQuickAdd = () => {
    if (!profiles?.length || !folders?.length) {
      toast("Could not load quality profiles or root folders", "error");
      return;
    }

    addMovie.mutate(
      {
        tmdbId: result.tmdbId,
        title: result.title,
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
      },
      {
        onSuccess: () => toast(`${result.title} added to Radarr`),
        onError: () => toast("Failed to add movie", "error"),
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
          <Film size={20} color="#71717a" />
        </View>
      )}
      <View className="flex-1 justify-center">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {result.title}
        </Text>
        <Text className="text-zinc-500 text-xs">{result.year}</Text>
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
            disabled={addMovie.isPending}
            hitSlop={4}
          >
            <Plus size={20} color="#3b82f6" />
          </Pressable>
        </View>
      )}
    </Card>
  );
}
