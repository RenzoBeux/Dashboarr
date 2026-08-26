import { useMemo } from "react";
import { View, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Bookmark,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  User,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { MediaDetailHero } from "@/components/common/media-detail-hero";
import { MediaDetailSkeleton } from "@/components/common/media-detail-skeleton";
import {
  MediaActionBar,
  type MediaActionItem,
} from "@/components/common/media-action-bar";
import { MediaStatsStrip, type MediaStat } from "@/components/common/media-stats-strip";
import { ExpandableText } from "@/components/common/expandable-text";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toastError } from "@/components/ui/toast";
import {
  useBinderyAuthor,
  useBinderyQueue,
  useUpdateBinderyAuthor,
  useDeleteBinderyAuthor,
  useRefreshBinderyAuthor,
} from "@/hooks/use-bindery";
import { useServiceImage } from "@/hooks/use-service-image";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { binderyImageSource } from "@/lib/bindery-normalize";
import { BAR_KIND_COLOR, binderyBookBarKind } from "@/lib/arr-poster-status";
import type { BinderyAuthor, BinderyBook } from "@/lib/types";

type DeleteMode = "keep" | "withFiles";

// A book counts as "have" once its file has landed. These are the only two
// statuses that mean the book is on disk.
function isOnDisk(book: BinderyBook): boolean {
  return book.status === "downloaded" || book.status === "imported";
}

export default function AuthorDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: author, isLoading, error } = useBinderyAuthor(Number(id), instanceId);
  const { data: queue } = useBinderyQueue(instanceId);
  const updateAuthor = useUpdateBinderyAuthor(instanceId);
  const deleteAuthor = useDeleteBinderyAuthor(instanceId);
  const refreshAuthor = useRefreshBinderyAuthor(instanceId);
  // A freshly added author has no books until Bindery's async catalogue fetch
  // lands, and there is no completion signal to poll on — so the user needs a
  // way to ask again. The empty state below points at this gesture.
  const { refreshing, onRefresh } = usePullToRefresh([["bindery"]]);

  const flow = useModalFlow<{
    actions: void;
    confirmDelete: DeleteMode;
  }>();

  // Bindery gives one relative proxy path rather than an images[] array, and
  // has no fanart concept — so the hero runs with a poster only.
  const poster = useMemo(() => binderyImageSource(author?.imageUrl), [author?.imageUrl]);
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "bindery");

  // GET /author/{id} embeds the author's full book list. That is the only
  // place real completion numbers exist: the `statistics` object upstream
  // attaches to the LIST response carries bookCount and two fields it never
  // populates, so counts have to be derived from the books themselves.
  const books = useMemo(
    () =>
      (author?.books ?? [])
        .slice()
        .sort((a, b) => releaseTime(b) - releaseTime(a)),
    [author?.books],
  );
  const onDiskCount = useMemo(() => books.filter(isOnDisk).length, [books]);

  const downloadingBookIds = useMemo(
    () =>
      new Set(
        (queue?.items ?? [])
          .map((r) => r.bookId)
          .filter((bId): bId is number => bId != null),
      ),
    [queue],
  );

  if (isLoading) {
    return <MediaDetailSkeleton />;
  }
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load author" className="mt-4" />
      </ScreenWrapper>
    );
  }
  if (!author) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">Author not found</Text>
      </ScreenWrapper>
    );
  }

  const handleToggleMonitor = () => {
    updateAuthor.mutate({
      authorId: author.id,
      payload: { monitored: !author.monitored },
    });
  };

  const confirmDelete = () => {
    const mode = flow.payload("confirmDelete");
    if (!mode) return;
    flow.close();
    deleteAuthor.mutate(
      { authorId: author.id, deleteFiles: mode === "withFiles" },
      {
        // flow.back() pops only once the confirm has fully dismissed.
        onSuccess: () => flow.back(),
        onError: (err) => toastError("Failed to delete author", err),
      },
    );
  };

  const actions: MediaActionItem[] = [
    {
      key: "monitor",
      icon: Bookmark,
      label: author.monitored ? "Monitored" : "Monitor",
      active: author.monitored,
      loading: updateAuthor.isPending,
      onPress: handleToggleMonitor,
    },
    {
      key: "refresh",
      icon: RefreshCw,
      label: "Refresh",
      loading: refreshAuthor.isPending,
      onPress: () => refreshAuthor.mutate(author.id),
    },
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => flow.open("actions"),
    },
  ];

  return (
    <>
      <ScreenWrapper edgeToEdge refreshing={refreshing} onRefresh={onRefresh}>
        <MediaDetailHero
          posterUrl={posterUrl}
          onPosterError={onPosterError}
          title={author.authorName}
          metaLine={buildAuthorMeta(author, books.length)}
          ratings={
            author.averageRating
              ? { value: author.averageRating, votes: author.ratingsCount }
              : undefined
          }
          posterFallbackIcon={User}
          badges={
            author.disambiguation ? (
              <Badge label={author.disambiguation} variant="default" />
            ) : null
          }
        />

        <View className="px-4 mt-6">
          <MediaActionBar actions={actions} className="mb-4" />

          <MediaStatsStrip stats={buildAuthorStats(author, books.length, onDiskCount)} className="mb-5" />

          {books.length > 0 && (
            <View className="mb-5">
              <SectionLabel>Library</SectionLabel>
              <Card>
                <View className="flex-row items-center justify-between mb-2">
                  <Text className="text-zinc-300 text-sm">
                    {onDiskCount} of {books.length} on disk
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {Math.round((onDiskCount / books.length) * 100)}%
                  </Text>
                </View>
                <ProgressBar
                  progress={onDiskCount / books.length}
                  fillColor={BAR_KIND_COLOR[onDiskCount === books.length ? "success" : "primary"]}
                />
              </Card>
            </View>
          )}

          {author.description ? (
            <View className="mb-5">
              <SectionLabel>Overview</SectionLabel>
              <ExpandableText text={author.description} numberOfLines={4} />
            </View>
          ) : null}

          <View className="mb-2">
            <SectionLabel>Books</SectionLabel>
            {books.length === 0 ? (
              // A freshly added author has no books until the server's async
              // catalogue fetch lands, so this state is expected, not an error.
              <Text className="text-zinc-500 text-sm ml-1">
                No books yet. Bindery fetches an author&apos;s catalogue in the
                background after adding; pull to refresh in a moment.
              </Text>
            ) : (
              <View className="gap-2">
                {books.map((book) => (
                  <BookRow
                    key={book.id}
                    book={book}
                    instanceId={instanceId}
                    downloading={downloadingBookIds.has(book.id)}
                  />
                ))}
              </View>
            )}
          </View>
        </View>
      </ScreenWrapper>

      <ActionSheet
        {...flow.bind("actions")}
        title={author.authorName}
        actions={[
          {
            label: "Delete",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "keep"),
          },
          {
            label: "Delete + Files",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => flow.open("confirmDelete", "withFiles"),
          },
        ]}
      />

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title={
          flow.payload("confirmDelete") === "withFiles"
            ? "Delete author + files?"
            : "Delete author?"
        }
        message={
          flow.payload("confirmDelete") === "withFiles"
            ? `Remove "${author.authorName}" from Bindery and delete files from disk. This can't be undone.`
            : `Remove "${author.authorName}" from Bindery. Files on disk will be kept.`
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={
          flow.payload("confirmDelete") === "withFiles" ? "Delete + Files" : "Delete"
        }
        onConfirm={confirmDelete}
      />
    </>
  );
}

function releaseTime(book: BinderyBook): number {
  return book.releaseDate ? new Date(book.releaseDate).getTime() : 0;
}

// Bindery tracks no per-author path or disk usage, so the meta line stays to
// what actually exists.
function buildAuthorMeta(author: BinderyAuthor, bookCount: number): string {
  const parts: string[] = [];
  if (bookCount > 0) parts.push(`${bookCount} book${bookCount === 1 ? "" : "s"}`);
  if (author.metadataProvider) parts.push(author.metadataProvider);
  return parts.join(" · ");
}

function buildAuthorStats(
  author: BinderyAuthor,
  bookCount: number,
  onDiskCount: number,
): MediaStat[] {
  const stats: MediaStat[] = [
    { label: "Books", value: String(bookCount) },
    { label: "On disk", value: String(onDiskCount) },
    { label: "Wanted", value: String(bookCount - onDiskCount) },
  ];
  if (author.monitorMode) {
    stats.push({ label: "Monitor", value: author.monitorMode });
  }
  return stats;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
      {children}
    </Text>
  );
}

function BookRow({
  book,
  instanceId,
  downloading,
}: {
  book: BinderyBook;
  instanceId?: string;
  downloading: boolean;
}) {
  const router = useRouter();
  const year = book.releaseDate ? new Date(book.releaseDate).getFullYear() : null;
  const meta = [
    Number.isFinite(year) ? String(year) : null,
    book.mediaType === "both" ? "ebook + audiobook" : book.mediaType,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <Card
      onPress={() =>
        router.push(
          instanceId ? `/book/${book.id}?instanceId=${instanceId}` : `/book/${book.id}`,
        )
      }
    >
      <View className="flex-row items-center gap-3">
        <View
          className="w-1 self-stretch rounded-full"
          style={{ backgroundColor: BAR_KIND_COLOR[binderyBookBarKind(book, downloading)] }}
        />
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm" numberOfLines={1}>
            {book.title}
          </Text>
          {meta ? (
            <Text className="text-zinc-500 text-xs mt-1" numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
        {!book.monitored ? <Badge label="Unmonitored" variant="default" /> : null}
      </View>
    </Card>
  );
}
