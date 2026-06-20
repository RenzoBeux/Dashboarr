import { Mic2 } from "lucide-react-native";
import { toast, toastError } from "@/components/ui/toast";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import {
  useAddArtist,
  useLidarrQualityProfiles,
  useLidarrMetadataProfiles,
  useLidarrRootFolders,
} from "@/hooks/use-lidarr";
import type { LidarrArtistSearchResult } from "@/lib/types";

/**
 * One Lidarr artist lookup result row: owns the quick-add mutation and renders
 * the shared MediaSearchResultCard. Reused by the dedicated /artist/search
 * screen and the global-search Music section.
 */
export function LidarrSearchRow({
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
  const addArtist = useAddArtist();
  const { data: profiles } = useLidarrQualityProfiles();
  const { data: metadataProfiles } = useLidarrMetadataProfiles();
  const { data: folders } = useLidarrRootFolders();

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

  const metaLine = [result.artistType, result.disambiguation]
    .filter(Boolean)
    .join(" · ");

  return (
    <MediaSearchResultCard
      serviceId="lidarr"
      poster={result.images.find((i) => i.coverType === "poster")}
      fallbackIcon={Mic2}
      title={result.artistName}
      metaLine={metaLine || undefined}
      overview={result.overview}
      alreadyAdded={existingArtistId !== undefined}
      addPending={addArtist.isPending}
      onQuickAdd={handleQuickAdd}
      onAdvanced={onAdvanced}
      onOpenExisting={onOpenExisting}
    />
  );
}
