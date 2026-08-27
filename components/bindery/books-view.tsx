import { memo, useState, useMemo } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  RefreshControl,
  type RefreshControlProps,
} from "react-native";
import { useRouter } from "expo-router";
import {
  Search,
  BookOpen,
  User,
  Eye,
  EyeOff,
  Trash2,
  Info,
  RefreshCw,
  RotateCw,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper, useScreenBottomPadding } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { QueueIssuesBanner } from "@/components/services/queue-issues-banner";
import { binderyArrQueueAdapter } from "@/lib/arr-queue-adapters/bindery";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { FilterChip } from "@/components/ui/filter-chip";
import { ActionSheet, type ActionSheetAction } from "@/components/ui/action-sheet";
import { FilterSortButton } from "@/components/common/filter-sort-button";
import { FilterSortSheet } from "@/components/common/filter-sort-sheet";
import { ConfirmModal } from "@/components/common/confirm-modal";
import {
  MonitoredLibraryGrid,
  MONITOR_FILTER_OPTIONS,
  type MonitorFilter,
} from "@/components/common/monitored-library-grid";
import {
  useSortStore,
  SORT_DEFAULTS,
  type BinderyAuthorsSortKey,
} from "@/store/sort-store";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import {
  useBinderyAuthors,
  useBinderyQueue,
  useBinderyWanted,
  useUpdateBinderyAuthor,
  useDeleteBinderyAuthor,
  useRefreshBinderyAuthor,
  useToggleBinderyBookMonitored,
  useRetryBinderyImport,
} from "@/hooks/use-bindery";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useUiScale } from "@/hooks/use-ui-scale";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { mediumHaptic } from "@/lib/haptics";
import {
  binderyCanRetryImport,
  binderyImageSource,
  binderyQueueProgress,
} from "@/lib/bindery-normalize";
import {
  BAR_KIND_COLOR,
  binderyBookBarKind,
  binderyBookIsMissing,
} from "@/lib/arr-poster-status";
import type { BinderyAuthor, BinderyBook, BinderyQueueItem } from "@/lib/types";
import { useAppTheme } from "@/hooks/use-app-theme";

// MonitoredLibraryGrid keys on `title` and reads an images[] array. Bindery
// gives us `authorName` and a single relative imageUrl, so both are projected
// on here rather than teaching the shared grid a second poster shape.
type AuthorItem = BinderyAuthor & {
  title: string;
  images: { coverType: string; url: string; remoteUrl: string }[];
};
type BookItem = BinderyBook & {
  images: { coverType: string; url: string; remoteUrl: string }[];
};

type Tab = "library" | "queue" | "wanted";
type MediaFilter = "all" | "ebook" | "audiobook" | "both";

type PendingDelete = { id: number; title: string; withFiles: boolean };

function toPosterImages(imageUrl: string | undefined) {
  const source = binderyImageSource(imageUrl);
  return source
    ? [{ coverType: "poster", url: source.url, remoteUrl: source.remoteUrl }]
    : [];
}

function toAuthorItem(author: BinderyAuthor): AuthorItem {
  return { ...author, title: author.authorName, images: toPosterImages(author.imageUrl) };
}

function toBookItem(book: BinderyBook): BookItem {
  return { ...book, images: toPosterImages(book.imageUrl) };
}

// Every value here is one the Bindery server whitelists — the key is passed
// straight through as ?sort=. An unrecognised value is ignored upstream and
// silently falls back to A-Z, which would read as a broken control.
// "Missing" is dropped: it needs a per-author completed-vs-total answer, and
// Bindery reports none (see lib/arr-poster-status.ts). Offering it would give
// the user a filter that always selects nothing.
const AUTHOR_FILTER_OPTIONS = MONITOR_FILTER_OPTIONS.filter(
  (f) => f.value !== "missing",
);

const SORT_OPTIONS: { key: BinderyAuthorsSortKey; label: string }[] = [
  { key: "az", label: "Sort Name: A → Z" },
  { key: "za", label: "Sort Name: Z → A" },
  { key: "name-az", label: "Name: A → Z" },
  { key: "name-za", label: "Name: Z → A" },
  { key: "recent", label: "Recently Added" },
  { key: "books-desc", label: "Books: Most First" },
  { key: "books-asc", label: "Books: Fewest First" },
  { key: "rating-desc", label: "Rating: Highest First" },
];

// "Dual format" rather than "Both": upstream's mediaType filter is asymmetric.
// `ebook` and `audiobook` both match dual-format books too, but `both` matches
// ONLY books that carry both formats — so labelling it "Both" would read as
// "either" and select the opposite of what the user meant.
const MEDIA_FILTERS: { key: MediaFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ebook", label: "Ebooks" },
  { key: "audiobook", label: "Audiobooks" },
  { key: "both", label: "Dual format" },
];

// Sorting happens server-side, so the grid's comparator must not reorder what
// came back. MonitoredLibraryGrid requires one, so this is the identity.
function keepServerOrder(): number {
  return 0;
}

function bookYear(b: BinderyBook): string {
  if (!b.releaseDate) return b.author?.authorName ?? "";
  const y = new Date(b.releaseDate).getFullYear();
  return Number.isFinite(y) ? String(y) : (b.author?.authorName ?? "");
}

// Bindery (Books) library/queue/wanted view. Extracted into a component so it
// can render standalone in the Books tab. Mirrors MusicView.
export const BooksView = memo(function BooksView({
  topSlot,
  embedded = false,
}: {
  topSlot?: React.ReactNode;
  embedded?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("library");
  const theme = useAppTheme();
  const [monitorFilter, setMonitorFilter] = useState<MonitorFilter>("monitored");
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>("all");
  const sort = useSortStore((s) => s.books);
  const setSort = useSortStore((s) => s.setBooks);
  const [filterSortOpen, setFilterSortOpen] = useState(false);
  // Sheet data only — visibility lives in the flow. Deliberately never cleared
  // so sheet content stays correct during the dismiss animation.
  const [sheetAuthor, setSheetAuthor] = useState<AuthorItem | null>(null);
  const [sheetBook, setSheetBook] = useState<BinderyBook | null>(null);
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["bindery"]]);
  const bottomPadding = useScreenBottomPadding();
  const uiScale = useUiScale();

  const updateAuthor = useUpdateBinderyAuthor();
  const deleteAuthor = useDeleteBinderyAuthor();
  const refreshAuthor = useRefreshBinderyAuthor();
  const toggleBook = useToggleBinderyBookMonitored();

  // All modal sequencing (sheet → confirm, sheet → navigation) goes through
  // the flow — see hooks/use-modal-flow.ts.
  const flow = useModalFlow<{
    authorActions: void;
    bookActions: void;
    confirmDelete: PendingDelete;
  }>();

  const binderyHealth = healthData?.find((s) => s.id === "bindery");

  const authorActions: ActionSheetAction[] = useMemo(() => {
    if (!sheetAuthor) return [];
    const author = sheetAuthor;
    return [
      {
        label: "Refresh metadata",
        icon: <Icon icon={RefreshCw} size={18} color="#a1a1aa" />,
        onPress: () => refreshAuthor.mutate(author.id),
      },
      {
        label: author.monitored ? "Unmonitor" : "Monitor",
        icon: author.monitored ? (
          <Icon icon={EyeOff} size={18} color="#a1a1aa" />
        ) : (
          <Icon icon={Eye} size={18} color="#a1a1aa" />
        ),
        onPress: () =>
          updateAuthor.mutate({
            authorId: author.id,
            payload: { monitored: !author.monitored },
          }),
      },
      {
        label: "Open Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => flow.whenClear(() => router.push(`/author/${author.id}`)),
      },
      {
        label: "Delete",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () =>
          flow.open("confirmDelete", { id: author.id, title: author.title, withFiles: false }),
      },
      {
        label: "Delete + Files",
        icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
        variant: "danger",
        onPress: () =>
          flow.open("confirmDelete", { id: author.id, title: author.title, withFiles: true }),
      },
    ];
  }, [sheetAuthor, refreshAuthor, updateAuthor, flow, router]);

  const bookActions: ActionSheetAction[] = useMemo(() => {
    if (!sheetBook) return [];
    const b = sheetBook;
    return [
      {
        label: b.monitored ? "Unmonitor" : "Monitor",
        icon: b.monitored ? (
          <Icon icon={EyeOff} size={18} color="#a1a1aa" />
        ) : (
          <Icon icon={Eye} size={18} color="#a1a1aa" />
        ),
        onPress: () => toggleBook.mutate({ bookId: b.id, monitored: !b.monitored }),
      },
      {
        label: "Open Details",
        icon: <Icon icon={Info} size={18} color="#a1a1aa" />,
        onPress: () => flow.whenClear(() => router.push(`/book/${b.id}`)),
      },
    ];
  }, [sheetBook, toggleBook, flow, router]);

  const openAuthorSheet = (author: AuthorItem) => {
    mediumHaptic();
    setSheetAuthor(author);
    flow.open("authorActions");
  };
  const openBookSheet = (b: BinderyBook) => {
    mediumHaptic();
    setSheetBook(b);
    flow.open("bookActions");
  };

  const pendingDelete = flow.payload("confirmDelete");

  // Horizontal padding comes from ScreenWrapper's px-4; only vertical padding
  // here. pt = 0.5rem, matched at runtime so accessibility scale applies.
  const contentContainerStyle = {
    paddingTop: 7 * uiScale,
    paddingBottom: bottomPadding,
  };

  const refreshCtl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={onRefresh}
      tintColor="#3b82f6"
      colors={["#3b82f6"]}
      progressBackgroundColor={theme.surface}
    />
  );

  const header = (
    <>
      {topSlot}
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="Books" online={binderyHealth?.online} serviceId="bindery" />
        <Pressable
          onPress={() => router.push("/author/search")}
          className="p-2 active:opacity-70"
          accessibilityLabel="Add author"
        >
          <Icon icon={Search} size={ICON.LG} color="#a1a1aa" />
        </Pressable>
      </View>

      {/* No HealthIssuesBanner: Bindery exposes no *arr-style health-check
          array, so there is nothing for it to render. */}
      <QueueIssuesBanner adapter={binderyArrQueueAdapter} className="mb-4" />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-4"
      >
        {(["library", "queue", "wanted"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </ScrollView>

      {tab === "wanted" && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
          className="mb-4"
        >
          {MEDIA_FILTERS.map((f) => (
            <FilterChip
              key={f.key}
              label={f.label}
              selected={mediaFilter === f.key}
              onPress={() => setMediaFilter(f.key)}
            />
          ))}
        </ScrollView>
      )}

      {tab === "library" && (
        <View className="mb-4">
          <FilterSortButton
            summary={`${AUTHOR_FILTER_OPTIONS.find((f) => f.value === monitorFilter)?.label ?? ""} · ${SORT_OPTIONS.find((o) => o.key === sort)?.label ?? ""}`}
            onPress={() => setFilterSortOpen(true)}
            active={monitorFilter !== "monitored" || sort !== SORT_DEFAULTS.books}
          />
        </View>
      )}
    </>
  );

  const body = (
    <>
      {tab === "library" && (
        <AuthorLibrary
          monitorFilter={monitorFilter}
          sort={sort}
          onLongPress={openAuthorSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "wanted" && (
        <BookWanted
          mediaFilter={mediaFilter}
          onLongPress={openBookSheet}
          listHeader={header}
          refreshControl={refreshCtl}
          contentContainerStyle={contentContainerStyle}
        />
      )}
      {tab === "queue" && (
        <ScrollView
          className="flex-1"
          contentContainerStyle={contentContainerStyle}
          refreshControl={refreshCtl}
          showsVerticalScrollIndicator={false}
        >
          {header}
          <BookQueue />
        </ScrollView>
      )}

      <ActionSheet
        {...flow.bind("authorActions")}
        title={sheetAuthor?.title}
        actions={authorActions}
      />

      <ActionSheet
        {...flow.bind("bookActions")}
        title={sheetBook?.title}
        subtitle={sheetBook?.author?.authorName}
        actions={bookActions}
      />

      <FilterSortSheet
        visible={filterSortOpen}
        onClose={() => setFilterSortOpen(false)}
        title="Filter & sort authors"
        filterOptions={AUTHOR_FILTER_OPTIONS.map((f) => ({
          key: f.value,
          label: f.label,
        }))}
        filterValue={monitorFilter}
        onFilterChange={setMonitorFilter}
        sortOptions={SORT_OPTIONS.map((o) => ({ key: o.key, label: o.label }))}
        sortValue={sort}
        onSortChange={setSort}
      />

      <ConfirmModal
        {...flow.bind("confirmDelete")}
        title={pendingDelete?.withFiles ? "Delete author + files?" : "Delete author?"}
        message={
          pendingDelete
            ? pendingDelete.withFiles
              ? `Remove "${pendingDelete.title}" from Bindery and delete files from disk. This can't be undone.`
              : `Remove "${pendingDelete.title}" from Bindery. Files on disk will be kept.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel={pendingDelete?.withFiles ? "Delete + Files" : "Delete"}
        onConfirm={() => {
          if (pendingDelete) {
            deleteAuthor.mutate({
              authorId: pendingDelete.id,
              deleteFiles: pendingDelete.withFiles,
            });
          }
          flow.close();
        }}
      />
    </>
  );

  return embedded ? (
    <View className="flex-1 px-4">{body}</View>
  ) : (
    <ScreenWrapper scrollable={false}>{body}</ScreenWrapper>
  );
});

function AuthorLibrary({
  monitorFilter,
  sort,
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  monitorFilter: MonitorFilter;
  sort: BinderyAuthorsSortKey;
  onLongPress: (author: AuthorItem) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<typeof MonitoredLibraryGrid>["contentContainerStyle"];
}) {
  // Sorting is server-side; the monitor filter stays client-side so the grid's
  // empty state can still tell "library is empty" from "nothing matches".
  const { data: authors, isLoading, error } = useBinderyAuthors({ sort });
  const router = useRouter();

  const items: AuthorItem[] = useMemo(
    () => (authors ?? []).map(toAuthorItem),
    [authors],
  );

  return (
    <MonitoredLibraryGrid
      data={items}
      isLoading={isLoading}
      error={error}
      monitorFilter={monitorFilter}
      // Bindery reports no per-author completion data (see
      // lib/arr-poster-status.ts), so "missing" cannot be answered at author
      // level and the Missing filter selects nothing rather than lying.
      isMissing={() => false}
      sort={sort}
      compare={keepServerOrder}
      serviceId="bindery"
      placeholderIcon={User}
      nounPlural="authors"
      renderFooter={(a) => {
        const count = a.statistics?.bookCount ?? 0;
        return count > 0 ? `${count} book${count === 1 ? "" : "s"}` : "No books yet";
      }}
      // No posterStatus on purpose: the only numbers available here are
      // bookCount (real) and availableBookCount/wantedBookCount (always 0
      // upstream), so any bar would read the same for every author.
      onItemPress={(a) => router.push(`/author/${a.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={listHeader}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}

function BookQueue() {
  const { data: queue, isLoading, error } = useBinderyQueue();
  const retryImport = useRetryBinderyImport();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={3} />;
  if (error) {
    return <ErrorBanner error={error} title="Failed to load queue" />;
  }
  if (!queue?.items.length) {
    return <EmptyState title="Queue empty" message="No books downloading" />;
  }

  return (
    <View className="gap-2">
      {/* `partial` means a download client did not answer in time, so live
          progress on some rows may be stale. The rows themselves are valid. */}
      {queue.partial && (
        <Text className="text-amber-500 text-xs mb-1">
          A download client did not respond; progress may be out of date.
        </Text>
      )}
      {queue.items.map((item: BinderyQueueItem) => {
        const progress = binderyQueueProgress(item.percentage, item.status);
        return (
          <Card
            key={item.id}
            onPress={() => item.bookId && router.push(`/book/${item.bookId}`)}
          >
            <View className="flex-row items-center justify-between">
              <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
                {item.book?.title || item.title}
              </Text>
              {item.protocol ? <Badge label={item.protocol} /> : null}
            </View>
            {item.book?.authorName ? (
              <Text className="text-zinc-500 text-xs mt-1" numberOfLines={1}>
                {item.book.authorName}
              </Text>
            ) : null}
            <Text className="text-zinc-500 text-xs mt-1">
              {Math.round(progress * 100)}%
              {item.timeLeft ? ` · ETA ${item.timeLeft}` : ""}
              {item.speed ? ` · ${item.speed}` : ""}
            </Text>
            {item.errorMessage ? (
              <Text className="text-red-400 text-xs mt-1" numberOfLines={2}>
                {item.errorMessage}
              </Text>
            ) : null}
            {/* Retry is Bindery's only recovery action, and the server rejects
                it with a 409 in every state but importFailed — so it is gated
                rather than offered everywhere and surfacing the error. */}
            {binderyCanRetryImport(item.status) ? (
              <Pressable
                onPress={() => retryImport.mutate(item.id)}
                disabled={retryImport.isPending}
                className="flex-row items-center gap-2 mt-2 active:opacity-70"
                accessibilityLabel="Retry import"
              >
                <Icon icon={RotateCw} size={14} color="#3b82f6" />
                <Text className="text-primary text-xs">Retry import</Text>
              </Pressable>
            ) : null}
          </Card>
        );
      })}
    </View>
  );
}

function BookWanted({
  mediaFilter,
  onLongPress,
  listHeader,
  refreshControl,
  contentContainerStyle,
}: {
  mediaFilter: MediaFilter;
  onLongPress: (book: BinderyBook) => void;
  listHeader: React.ReactElement;
  refreshControl: React.ReactElement<RefreshControlProps>;
  contentContainerStyle: React.ComponentProps<
    typeof MonitoredLibraryGrid
  >["contentContainerStyle"];
}) {
  const { data: wanted, isLoading, error } = useBinderyWanted();
  const { data: queue } = useBinderyQueue();
  const router = useRouter();

  const downloading = useMemo(
    () =>
      new Set(
        (queue?.items ?? [])
          .map((r) => r.bookId)
          .filter((x): x is number => typeof x === "number"),
      ),
    [queue],
  );

  // The wanted list is fetched unfiltered so the count and the media chips can
  // both read from one cache entry; mediaType is applied here with upstream's
  // own asymmetric semantics (ebook/audiobook include dual-format books,
  // "both" means dual-format only).
  const items: BookItem[] = useMemo(() => {
    const all = (wanted ?? []).map(toBookItem);
    if (mediaFilter === "all") return all;
    if (mediaFilter === "both") return all.filter((b) => b.mediaType === "both");
    return all.filter((b) => b.mediaType === mediaFilter || b.mediaType === "both");
  }, [wanted, mediaFilter]);

  const count = items.length;
  const header = (
    <>
      {listHeader}
      {!isLoading && (
        <View className="mb-4">
          <Text className="text-zinc-400 text-sm">
            {count} missing {count === 1 ? "book" : "books"}
          </Text>
        </View>
      )}
    </>
  );

  return (
    <MonitoredLibraryGrid
      data={items}
      isLoading={isLoading}
      error={error}
      monitorFilter="all"
      isMissing={binderyBookIsMissing}
      // The server already returned these newest-release-first (getWantedBooks
      // asks for sort=date-new), so the grid must not reorder them.
      sort="date-new"
      compare={keepServerOrder}
      serviceId="bindery"
      placeholderIcon={BookOpen}
      nounPlural="missing books"
      renderFooter={(b) => bookYear(b)}
      posterStatus={(b) => ({
        barColor: BAR_KIND_COLOR[binderyBookBarKind(b, downloading.has(b.id))],
        cornerColor: null,
      })}
      onItemPress={(b) => router.push(`/book/${b.id}`)}
      onItemLongPress={onLongPress}
      ListHeaderComponent={header}
      refreshControl={refreshControl}
      contentContainerStyle={contentContainerStyle}
    />
  );
}
