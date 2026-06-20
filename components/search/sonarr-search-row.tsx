import { Tv } from "lucide-react-native";
import { toast, toastError } from "@/components/ui/toast";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import {
  useAddSeries,
  useSonarrQualityProfiles,
  useSonarrRootFolders,
} from "@/hooks/use-sonarr";
import type { SonarrSearchResult } from "@/lib/types";

/**
 * One Sonarr lookup result row: owns the quick-add mutation and renders the
 * shared MediaSearchResultCard. Reused by the dedicated /series/search screen
 * and the global-search TV section.
 */
export function SonarrSearchRow({
  result,
  existingSeriesId,
  onAdvanced,
  onOpenExisting,
}: {
  result: SonarrSearchResult;
  existingSeriesId: number | undefined;
  onAdvanced: () => void;
  onOpenExisting: () => void;
}) {
  const addSeries = useAddSeries();
  const { data: profiles } = useSonarrQualityProfiles();
  const { data: folders } = useSonarrRootFolders();

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
        onError: (err) => toastError("Failed to add series", err),
      },
    );
  };

  const metaLine = [
    result.year,
    result.network,
    `${result.seasonCount} season${result.seasonCount !== 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <MediaSearchResultCard
      serviceId="sonarr"
      poster={result.images.find((i) => i.coverType === "poster")}
      fallbackIcon={Tv}
      title={result.title}
      metaLine={metaLine}
      overview={result.overview}
      alreadyAdded={existingSeriesId !== undefined}
      addPending={addSeries.isPending}
      onQuickAdd={handleQuickAdd}
      onAdvanced={onAdvanced}
      onOpenExisting={onOpenExisting}
    />
  );
}
