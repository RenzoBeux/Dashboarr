import { useMemo } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Bookmark,
  BookOpen,
  Ban,
  FileText,
  Headphones,
  MoreHorizontal,
  Search,
  Trash2,
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
import { ActionSheet } from "@/components/ui/action-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toastError } from "@/components/ui/toast";
import {
  useBinderyBook,
  useToggleBinderyBookMonitored,
  useToggleBinderyBookExcluded,
  useDeleteBinderyBook,
  useDeleteBinderyBookFile,
  useSearchBinderyBook,
} from "@/hooks/use-bindery";
import { useServiceImage } from "@/hooks/use-service-image";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { binderyImageSource } from "@/lib/bindery-normalize";
import { formatBytes, formatRuntime } from "@/lib/utils";
import type { BinderyBook, BinderyBookFile } from "@/lib/types";

type DeleteMode = "keep" | "withFiles";
type PendingFileDelete = { bookId: number; format: "ebook" | "audiobook"; path: string };

const STATUS_LABELS: Record<string, string> = {
  wanted: "Wanted",
  downloading: "Downloading",
  downloaded: "Downloaded",
  imported: "Imported",
  skipped: "Skipped",
};

export default function BookDetailScreen() {
  const { id, instanceId } = useLocalSearchParams<{
    id: string;
    instanceId?: string;
  }>();
  const router = useRouter();
  const { data: book, isLoading, error } = useBinderyBook(Number(id), instanceId);
  const toggleMonitored = useToggleBinderyBookMonitored(instanceId);
  const toggleExcluded = useToggleBinderyBookExcluded(instanceId);
  const deleteBook = useDeleteBinderyBook(instanceId);
  const deleteFile = useDeleteBinderyBookFile(instanceId);
  const searchBook = useSearchBinderyBook(instanceId);

  const flow = useModalFlow<{
    actions: void;
    confirmDelete: DeleteMode;
    confirmDeleteFile: PendingFileDelete;
  }>();

  const poster = useMemo(() => binderyImageSource(book?.imageUrl), [book?.imageUrl]);
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "bindery");

  if (isLoading) {
    return <MediaDetailSkeleton />;
  }
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load book" className="mt-4" />
      </ScreenWrapper>
    );
  }
  if (!book) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <Text className="text-zinc-400 text-center mt-10">Book not found</Text>
      </ScreenWrapper>
    );
  }

  const confirmDelete = () => {
    const mode = flow.payload("confirmDelete");
    if (!mode) return;
    flow.close();
    deleteBook.mutate(
      { bookId: book.id, deleteFiles: mode === "withFiles" },
      {
        // flow.back() pops only once the confirm has fully dismissed.
        onSuccess: () => flow.back(),
        onError: (err) => toastError("Failed to delete book", err),
      },
    );
  };

  const actions: MediaActionItem[] = [
    {
      key: "monitor",
      icon: Bookmark,
      label: book.monitored ? "Monitored" : "Monitor",
      active: book.monitored,
      loading: toggleMonitored.isPending,
      onPress: () =>
        toggleMonitored.mutate({ bookId: book.id, monitored: !book.monitored }),
    },
    {
      key: "search",
      icon: Search,
      label: "Search",
      loading: searchBook.isPending,
      onPress: () => searchBook.mutate(book.id),
    },
    {
      key: "more",
      icon: MoreHorizontal,
      label: "More",
      onPress: () => flow.open("actions"),
    },
  ];

  const files = book.bookFiles ?? [];
  const pendingFileDelete = flow.payload("confirmDeleteFile");

  return (
    <>
      <ScreenWrapper edgeToEdge>
        <MediaDetailHero
          posterUrl={posterUrl}
          onPosterError={onPosterError}
          title={book.title}
          metaLine={buildBookMeta(book)}
          ratings={
            book.averageRating
              ? { value: book.averageRating, votes: book.ratingsCount }
              : undefined
          }
          posterFallbackIcon={BookOpen}
          badges={
            <View className="flex-row gap-2">
              <Badge
                label={STATUS_LABELS[book.status] ?? String(book.status)}
                variant="default"
              />
              {book.excluded ? <Badge label="Excluded" variant="default" /> : null}
            </View>
          }
        />

        <View className="px-4 mt-6">
          <MediaActionBar actions={actions} className="mb-4" />

          <MediaStatsStrip stats={buildBookStats(book, files)} className="mb-5" />

          {book.author?.authorName ? (
            <View className="mb-5">
              <SectionLabel>Author</SectionLabel>
              <Card
                onPress={() =>
                  router.push(
                    instanceId
                      ? `/author/${book.authorId}?instanceId=${instanceId}`
                      : `/author/${book.authorId}`,
                  )
                }
              >
                <Text className="text-zinc-200 text-sm">{book.author.authorName}</Text>
              </Card>
            </View>
          ) : null}

          {/* Files, not editions. Bindery's Book model declares editions[] but
              no endpoint ever populates it, so bookFiles[] (attached only to
              this single-book response) is the real on-disk picture. */}
          <View className="mb-5">
            <SectionLabel>Files</SectionLabel>
            {files.length === 0 ? (
              <Text className="text-zinc-500 text-sm ml-1">Nothing on disk yet.</Text>
            ) : (
              <View className="gap-2">
                {files.map((file) => (
                  <FileRow
                    key={file.id ?? file.path}
                    file={file}
                    onDelete={() =>
                      flow.open("confirmDeleteFile", {
                        bookId: book.id,
                        format: file.format,
                        path: file.path,
                      })
                    }
                  />
                ))}
              </View>
            )}
          </View>

          {book.identifiers && book.identifiers.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Identifiers</SectionLabel>
              <Card>
                <View className="gap-2">
                  {book.identifiers.map((ident, i) => (
                    <View
                      key={`${ident.provider ?? i}-${ident.identifier ?? ident.value ?? i}`}
                      className="flex-row items-center justify-between"
                    >
                      <Text className="text-zinc-400 text-xs">
                        {ident.provider ?? "Unknown"}
                      </Text>
                      <Text className="text-zinc-300 text-xs" numberOfLines={1}>
                        {ident.identifier ?? ident.value ?? ""}
                      </Text>
                    </View>
                  ))}
                </View>
              </Card>
            </View>
          ) : null}

          {book.description ? (
            <View className="mb-5">
              <SectionLabel>Overview</SectionLabel>
              <ExpandableText text={book.description} numberOfLines={4} />
            </View>
          ) : null}

          {book.genres && book.genres.length > 0 ? (
            <View className="mb-5">
              <SectionLabel>Genres</SectionLabel>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerClassName="gap-2"
              >
                {book.genres.map((g) => (
                  <Badge key={g} label={g} variant="default" />
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </ScreenWrapper>

      <ActionSheet
        {...flow.bind("actions")}
        title={book.title}
        subtitle={book.author?.authorName}
        actions={[
          {
            label: book.excluded ? "Stop excluding" : "Exclude from searches",
            icon: <Icon icon={Ban} size={18} color="#a1a1aa" />,
            onPress: () => toggleExcluded.mutate(book.id),
          },
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
            ? "Delete book + files?"
            : "Delete book?"
        }
        message={
          flow.payload("confirmDelete") === "withFiles"
            ? `Remove "${book.title}" from Bindery and delete files from disk. This can't be undone.`
            : `Remove "${book.title}" from Bindery. Files on disk will be kept.`
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={
          flow.payload("confirmDelete") === "withFiles" ? "Delete + Files" : "Delete"
        }
        onConfirm={confirmDelete}
      />

      <ConfirmModal
        {...flow.bind("confirmDeleteFile")}
        title="Delete file?"
        message={
          pendingFileDelete
            ? `Delete the ${pendingFileDelete.format} file from disk. Bindery will mark the book wanted again. This can't be undone.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          if (pendingFileDelete) {
            deleteFile.mutate({
              bookId: pendingFileDelete.bookId,
              format: pendingFileDelete.format,
            });
          }
          flow.close();
        }}
      />
    </>
  );
}

function buildBookMeta(book: BinderyBook): string {
  const parts: string[] = [];
  if (book.author?.authorName) parts.push(book.author.authorName);
  if (book.releaseDate) {
    const year = new Date(book.releaseDate).getFullYear();
    if (Number.isFinite(year)) parts.push(String(year));
  }
  if (book.mediaType) {
    parts.push(book.mediaType === "both" ? "ebook + audiobook" : book.mediaType);
  }
  return parts.join(" · ");
}

function buildBookStats(book: BinderyBook, files: BinderyBookFile[]): MediaStat[] {
  const stats: MediaStat[] = [
    { label: "Status", value: STATUS_LABELS[book.status] ?? String(book.status) },
  ];
  const totalBytes = files.reduce((sum, f) => sum + (f.sizeBytes || 0), 0);
  if (totalBytes > 0) stats.push({ label: "Size", value: formatBytes(totalBytes) });
  if (book.durationSeconds) {
    // formatRuntime carries 60 minutes into the hour; rounding the remainder
    // here instead would print "1h 60m" for an audiobook of 7199 seconds.
    stats.push({
      label: "Duration",
      value: formatRuntime(Math.round(book.durationSeconds / 60)),
    });
  }
  if (book.language) stats.push({ label: "Language", value: book.language });
  return stats;
}


function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
      {children}
    </Text>
  );
}

function FileRow({
  file,
  onDelete,
}: {
  file: BinderyBookFile;
  onDelete: () => void;
}) {
  const FormatIcon = file.format === "audiobook" ? Headphones : FileText;
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <Icon icon={FormatIcon} size={18} color="#a1a1aa" />
        <View className="flex-1">
          <Text className="text-zinc-200 text-sm capitalize">{file.format}</Text>
          <Text className="text-zinc-500 text-xs mt-1" numberOfLines={1}>
            {file.path}
          </Text>
        </View>
        {file.sizeBytes ? (
          <Text className="text-zinc-400 text-xs">{formatBytes(file.sizeBytes)}</Text>
        ) : null}
        <Pressable
          onPress={onDelete}
          className="p-2 active:opacity-70"
          accessibilityLabel={`Delete ${file.format} file`}
        >
          <Icon icon={Trash2} size={16} color="#ef4444" />
        </Pressable>
      </View>
    </Card>
  );
}
