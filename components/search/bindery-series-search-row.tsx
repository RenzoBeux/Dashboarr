import { Library } from "lucide-react-native";
import { MediaSearchResultCard } from "@/components/search/media-search-result-card";
import { useAddBinderySeries } from "@/hooks/use-bindery";
import type { BinderySeriesSearchResult } from "@/lib/types";

/**
 * One Hardcover series result. Adding creates and links the series in
 * Bindery; filling and monitoring it is done from Bindery's series page.
 * Results have no "already added" flag, so duplicates surface on add (409).
 */
export function BinderySeriesSearchRow({ result }: { result: BinderySeriesSearchResult }) {
  const addSeries = useAddBinderySeries();

  const metaLine =
    [
      result.authorName,
      result.bookCount > 0
        ? `${result.bookCount} book${result.bookCount === 1 ? "" : "s"}`
        : undefined,
    ]
      .filter(Boolean)
      .join(" · ") || undefined;

  return (
    <MediaSearchResultCard
      serviceId="bindery"
      fallbackIcon={Library}
      title={result.title}
      metaLine={metaLine}
      overview={result.books?.slice(0, 4).join(", ")}
      alreadyAdded={false}
      addPending={addSeries.isPending}
      onQuickAdd={() => addSeries.mutate(result)}
      onOpenExisting={() => {}}
    />
  );
}
