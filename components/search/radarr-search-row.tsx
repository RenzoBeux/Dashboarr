import { Film } from "lucide-react-native";
import { toast, toastError } from "@/components/ui/toast";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import {
  useAddMovie,
  useRadarrQualityProfiles,
  useRadarrRootFolders,
} from "@/hooks/use-radarr";
import type { RadarrSearchResult } from "@/lib/types";

/**
 * One Radarr lookup result row: owns the quick-add mutation (first quality
 * profile + first root folder) and renders the shared MediaSearchResultCard.
 * Reused by both the dedicated /movie/search screen and the global-search
 * Movies section, so the two stay in lockstep.
 */
export function RadarrSearchRow({
  result,
  existingMovieId,
  onAdvanced,
  onOpenExisting,
}: {
  result: RadarrSearchResult;
  existingMovieId: number | undefined;
  onAdvanced: () => void;
  onOpenExisting: () => void;
}) {
  const addMovie = useAddMovie();
  const { data: profiles } = useRadarrQualityProfiles();
  const { data: folders } = useRadarrRootFolders();

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
        onError: (err) => toastError("Failed to add movie", err),
      },
    );
  };

  return (
    <MediaSearchResultCard
      serviceId="radarr"
      poster={result.images.find((i) => i.coverType === "poster")}
      fallbackIcon={Film}
      title={result.title}
      metaLine={result.year ? String(result.year) : undefined}
      overview={result.overview}
      alreadyAdded={existingMovieId !== undefined}
      addPending={addMovie.isPending}
      onQuickAdd={handleQuickAdd}
      onAdvanced={onAdvanced}
      onOpenExisting={onOpenExisting}
    />
  );
}
