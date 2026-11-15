import { BookOpen } from "lucide-react-native";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import { useAddBinderyBook } from "@/hooks/use-bindery";
import {
  binderyRatingLabel,
  binderyReleaseYear,
  binderySearchImageSource,
} from "@/lib/bindery-normalize";
import type { BinderyBookSearchResult } from "@/lib/types";

/**
 * One Bindery book search result. Tapping it (or the advanced button) opens
 * the add sheet; quick-add uses Bindery's defaults: the book's own format,
 * searching on add.
 */
export function BinderyBookSearchRow({
  result,
  onSelect,
  onOpenExisting,
}: {
  result: BinderyBookSearchResult;
  onSelect: () => void;
  onOpenExisting: (bookId: number) => void;
}) {
  const addBook = useAddBinderyBook();

  const handleQuickAdd = () => {
    addBook.mutate({
      title: result.title,
      payload: {
        foreignBookId: result.foreignBookId,
        foreignAuthorId: result.author?.foreignAuthorId ?? "",
        authorName: result.author?.authorName ?? "",
        searchOnAdd: true,
      },
    });
  };

  const metaLine =
    [
      result.author?.authorName,
      binderyReleaseYear(result.releaseDate),
      binderyRatingLabel(result.averageRating, result.ratingsCount),
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <MediaSearchResultCard
      serviceId="bindery"
      poster={binderySearchImageSource(result.imageUrl)}
      fallbackIcon={BookOpen}
      title={result.title}
      metaLine={metaLine}
      overview={result.description}
      alreadyAdded={result.libraryBookId !== undefined}
      addPending={addBook.isPending}
      onQuickAdd={handleQuickAdd}
      onAdvanced={onSelect}
      onSelect={onSelect}
      onOpenExisting={() => {
        if (result.libraryBookId !== undefined) onOpenExisting(result.libraryBookId);
      }}
    />
  );
}
