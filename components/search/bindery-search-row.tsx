import { User } from "lucide-react-native";
import { toast, toastError } from "@/components/ui/toast";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import { useAddBinderyAuthor } from "@/hooks/use-bindery";
import type { BinderyAuthorSearchResult } from "@/lib/types";

/**
 * One Bindery author lookup result row: owns the quick-add mutation and renders
 * the shared MediaSearchResultCard. Reused by the dedicated /author/search
 * screen and the global-search Books section.
 *
 * Quick-add sends only the two fields Bindery requires. Unlike the *arr rows it
 * needs no profile or root-folder prefetch: everything else is optional server
 * side and falls back to the install's own defaults, which is the behaviour a
 * one-tap add should have anyway. The sheet is where overrides live.
 *
 * No poster is passed: search results are the one Bindery payload that is never
 * image-proxied, and OpenLibrary stubs usually carry no image at all.
 */
export function BinderySearchRow({
  result,
  existingAuthorId,
  onAdvanced,
  onOpenExisting,
}: {
  result: BinderyAuthorSearchResult;
  existingAuthorId: number | undefined;
  onAdvanced: () => void;
  onOpenExisting: () => void;
}) {
  const addAuthor = useAddBinderyAuthor();

  const handleQuickAdd = () => {
    addAuthor.mutate(
      {
        foreignAuthorId: result.foreignAuthorId,
        authorName: result.authorName,
        monitored: true,
        searchOnAdd: true,
      },
      {
        onSuccess: () => toast(`${result.authorName} added to Bindery`),
        onError: (err) => toastError("Failed to add author", err),
      },
    );
  };

  return (
    <MediaSearchResultCard
      serviceId="bindery"
      fallbackIcon={User}
      title={result.authorName}
      metaLine={result.disambiguation || undefined}
      overview={result.description}
      alreadyAdded={existingAuthorId !== undefined}
      addPending={addAuthor.isPending}
      onQuickAdd={handleQuickAdd}
      onAdvanced={onAdvanced}
      onOpenExisting={onOpenExisting}
    />
  );
}
