import { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  type RefreshControlProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useRouter } from "expo-router";
import {
  AudioWaveform,
  Ban,
  ChevronRight,
  CircleArrowUp,
  Download,
  FileDown,
  Film,
  History,
  Languages,
  Trash2,
  Tv,
  Upload,
  UserSearch,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBanner } from "@/components/common/error-banner";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { DetailStat, DetailStatGrid, MatchList } from "@/components/ui/detail-stat";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { useThemeColor } from "@/hooks/use-theme-color";
import { useLinkedArrInstance } from "@/hooks/use-bazarr-link";
import { useBazarrHistory } from "@/hooks/use-bazarr-library";
import { useBazarrSubtitleMutation } from "@/hooks/use-bazarr-subtitles";
import { blacklistSubtitle } from "@/services/bazarr-api";
import {
  groupHistoryByDay,
  historyActionMeta,
  type HistoryActionKind,
  type HistoryEntry,
} from "@/lib/bazarr-history";
import type { SubtitleTarget } from "@/lib/bazarr-subtitle-tools";

type HistoryFilter = "all" | "movies" | "episodes";

const ACTION_ICON: Record<HistoryActionKind, React.ComponentType<any>> = {
  deleted: Trash2,
  downloaded: Download,
  manual: UserSearch,
  upgraded: CircleArrowUp,
  uploaded: Upload,
  synced: AudioWaveform,
  translated: Languages,
  extracted: FileDown,
  unknown: History,
};

type Row =
  | { type: "day"; key: string; label: string }
  | { type: "entry"; key: string; entry: HistoryEntry };

/**
 * The Bazarr tab's History: movie and episode subtitle activity merged and
 * grouped by day. An entry opens a detail sheet with what matched, the file,
 * a way to open the movie/episode, and "Blacklist and search again" for a
 * downloaded subtitle that turned out wrong.
 */
export function BazarrHistoryView({
  bazarrId,
  header,
  refreshControl,
  contentContainerStyle,
}: {
  bazarrId: string;
  header: React.ReactElement;
  refreshControl?: React.ReactElement<RefreshControlProps>;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const router = useRouter();
  const tc = useThemeColor();
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const history = useBazarrHistory(bazarrId, filter);
  const radarrId = useLinkedArrInstance(bazarrId, "radarr");
  const sonarrId = useLinkedArrInstance(bazarrId, "sonarr");
  const flow = useModalFlow<{ detail: HistoryEntry; confirmBlacklist: HistoryEntry }>();

  const blacklist = useBazarrSubtitleMutation(
    bazarrId,
    (entry: HistoryEntry, id) =>
      blacklistSubtitle(
        targetOf(entry)!,
        {
          provider: entry.item.provider ?? "",
          subs_id: entry.item.subs_id ?? "",
          language: entry.item.language?.code2 ?? "",
          subtitles_path: entry.item.subtitles_path ?? "",
        },
        id,
      ),
    targetOf,
  );

  const rows = useMemo<Row[]>(
    () =>
      groupHistoryByDay(history.entries).flatMap((g) => [
        { type: "day" as const, key: `day-${g.key}`, label: g.label },
        ...g.entries.map((entry) => ({ type: "entry" as const, key: entry.key, entry })),
      ]),
    [history.entries],
  );

  const listHeader = (
    <View>
      {header}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName="gap-2"
        className="mb-2"
      >
        {(["all", "movies", "episodes"] as const).map((f) => (
          <FilterChip
            key={f}
            label={f === "all" ? "All" : f === "movies" ? "Movies" : "Episodes"}
            selected={filter === f}
            onPress={() => setFilter(f)}
          />
        ))}
      </ScrollView>
    </View>
  );

  const detail = flow.payload("detail");
  const confirmEntry = flow.payload("confirmBlacklist");
  const openTarget = detail ? openHref(detail, radarrId, sonarrId) : null;

  return (
    <>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        renderItem={({ item }) =>
          item.type === "day" ? (
            <Text className="text-zinc-500 text-xs font-semibold mt-3 mb-2 ml-1">
              {item.label}
            </Text>
          ) : (
            <HistoryRow entry={item.entry} onPress={() => flow.open("detail", item.entry)} />
          )
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          history.isLoading ? (
            <View className="gap-2 mt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} width="100%" height={60} borderRadius={14} />
              ))}
            </View>
          ) : history.error ? (
            <ErrorBanner error={history.error} title="Couldn't load history" />
          ) : (
            <EmptyState
              icon={<Icon icon={History} size={32} color="#71717a" />}
              title="No subtitle activity yet"
              message="Downloads, uploads and changes show up here."
            />
          )
        }
        ListFooterComponent={
          history.isFetchingMore ? (
            <View className="py-4">
              <ActivityIndicator size="small" color={tc("#a1a1aa")} />
            </View>
          ) : null
        }
        onEndReached={() => history.hasMore && history.loadMore()}
        onEndReachedThreshold={0.5}
        refreshControl={refreshControl}
        contentContainerStyle={contentContainerStyle}
        showsVerticalScrollIndicator={false}
      />

      <HistoryDetailSheet
        entry={flow.isOpen("detail") ? (detail ?? null) : null}
        onClose={flow.close}
        onClosed={flow.onClosed}
        openLabel={
          openTarget ? (detail?.kind === "movie" ? "Open movie" : "Open episode") : null
        }
        onOpen={() => {
          if (!openTarget) return;
          flow.close();
          flow.whenClear(() => router.push(openTarget));
        }}
        onBlacklist={() => detail && flow.open("confirmBlacklist", detail)}
      />

      <ConfirmModal
        {...flow.bind("confirmBlacklist")}
        title="Blacklist subtitle"
        message={
          confirmEntry
            ? `Delete the ${confirmEntry.item.language?.name ?? ""} subtitle from ${
                confirmEntry.item.provider ?? "this provider"
              } for ${titleOf(confirmEntry)}, block it from future searches, and look for a replacement?`
            : ""
        }
        icon={Ban}
        tone="danger"
        confirmLabel="Blacklist"
        onConfirm={() => {
          const entry = confirmEntry;
          flow.close();
          if (!entry) return;
          blacklist.mutate(entry, {
            onSuccess: () => toast("Blacklisted. Bazarr is looking for another subtitle…", "info"),
            onError: (err) => toastError("Couldn't blacklist the subtitle", err),
          });
        }}
      />
    </>
  );
}

function targetOf(entry: HistoryEntry): SubtitleTarget | null {
  const { item } = entry;
  if (entry.kind === "movie") return item.radarrId ? { type: "movie", radarrId: item.radarrId } : null;
  return item.sonarrSeriesId && item.sonarrEpisodeId
    ? { type: "episode", seriesId: item.sonarrSeriesId, episodeId: item.sonarrEpisodeId }
    : null;
}

function openHref(
  entry: HistoryEntry,
  radarrId: string | null,
  sonarrId: string | null,
): string | null {
  const { item } = entry;
  // Land on the subtitles: the movie's section expanded, or the episode's
  // subtitles sheet open on the series page.
  if (entry.kind === "movie") {
    return radarrId && item.radarrId
      ? `/movie/${item.radarrId}?instanceId=${radarrId}&subtitles=open`
      : null;
  }
  return sonarrId && item.sonarrSeriesId
    ? `/series/${item.sonarrSeriesId}?instanceId=${sonarrId}${
        item.sonarrEpisodeId ? `&subtitlesEpisode=${item.sonarrEpisodeId}` : ""
      }`
    : null;
}

function titleOf(entry: HistoryEntry): string {
  const { item } = entry;
  if (entry.kind === "movie") return item.title ?? "Unknown movie";
  return [item.seriesTitle, item.episode_number, item.episodeTitle].filter(Boolean).join(" · ");
}

function canBlacklist(entry: HistoryEntry): boolean {
  const { item } = entry;
  const kind = historyActionMeta(item.action).kind;
  return (
    (kind === "downloaded" || kind === "manual" || kind === "upgraded") &&
    !item.blacklisted &&
    !!item.provider &&
    !!item.subs_id &&
    !!item.subtitles_path &&
    !!targetOf(entry)
  );
}

function timeOf(entry: HistoryEntry): string {
  return entry.at
    ? entry.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : entry.item.timestamp;
}

function HistoryRow({ entry, onPress }: { entry: HistoryEntry; onPress: () => void }) {
  const { item } = entry;
  const meta = historyActionMeta(item.action);
  const ActionIcon = ACTION_ICON[meta.kind];
  const summary = [meta.label, item.provider, item.score].filter(Boolean).join(" · ");
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl bg-surface border border-border px-3 py-2.5 mb-2 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${titleOf(entry)}, ${summary}`}
    >
      <View className="w-9 h-9 rounded-xl bg-surface-light items-center justify-center">
        <Icon icon={ActionIcon} size={16} color={meta.kind === "deleted" ? "#f87171" : "#a1a1aa"} />
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-zinc-100 text-sm" numberOfLines={1}>
          {titleOf(entry)}
        </Text>
        <View className="flex-row items-center gap-2 mt-1 pt-1">
          {item.language ? (
            <SubtitleTrackChip
              code={item.language.code2}
              name={item.language.name}
              state="present"
              forced={item.language.forced}
              hi={item.language.hi}
              size="sm"
            />
          ) : null}
          <Text className="flex-1 text-zinc-500 text-xs" numberOfLines={1}>
            {summary}
          </Text>
        </View>
      </View>
      {item.blacklisted ? <Icon icon={Ban} size={14} color="#f87171" /> : null}
      <Text className="text-zinc-500 text-xs">{timeOf(entry)}</Text>
    </Pressable>
  );
}

function HistoryDetailSheet({
  entry: entryProp,
  onClose,
  onClosed,
  openLabel,
  onOpen,
  onBlacklist,
}: {
  entry: HistoryEntry | null;
  onClose: () => void;
  onClosed: () => void;
  // null when the movie/episode can't be opened (no linked Radarr/Sonarr).
  openLabel: string | null;
  onOpen: () => void;
  onBlacklist: () => void;
}) {
  // Keep showing the last entry while the sheet animates out.
  const last = useRef(entryProp);
  if (entryProp) last.current = entryProp;
  const entry = entryProp ?? last.current;
  const item = entry?.item;
  const meta = item ? historyActionMeta(item.action) : null;
  const when = entry?.at
    ? entry.at.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })
    : (item?.timestamp ?? "");

  return (
    <BottomSheet
      visible={entryProp !== null}
      onClose={onClose}
      onClosed={onClosed}
      header={
        entry && meta ? (
          <SheetTitleRow title={titleOf(entry)} subtitle={`${meta.label} · ${when}`} onClose={onClose} />
        ) : null
      }
    >
      {entry && item ? (
        <>
          <DetailStatGrid>
            <DetailStat label="Language" value={item.language?.name ?? "—"} />
            <DetailStat label="Score" value={item.score ?? "—"} />
            <DetailStat label="Provider" value={item.provider ?? "—"} />
            <DetailStat label="When" value={when} />
          </DetailStatGrid>
          <MatchList matched={item.matches ?? []} missed={item.dont_matches ?? []} />
          {item.subtitles_path ? (
            <Text selectable className="text-zinc-500 text-xs leading-5 mb-3">
              {item.subtitles_path}
            </Text>
          ) : null}

          {openLabel ? (
            <SheetAction
              icon={entry.kind === "movie" ? Film : Tv}
              label={openLabel}
              subtitle="Its Subtitles section on the Radarr or Sonarr page"
              onPress={onOpen}
            />
          ) : null}
          {canBlacklist(entry) ? (
            <SheetAction
              icon={Ban}
              label="Blacklist and search again"
              subtitle="Deletes this file, never picks it again, finds another"
              danger
              onPress={onBlacklist}
            />
          ) : null}
        </>
      ) : null}
    </BottomSheet>
  );
}

function SheetAction({
  icon,
  label,
  subtitle,
  danger = false,
  onPress,
}: {
  icon: React.ComponentType<any>;
  label: string;
  subtitle: string;
  danger?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center gap-3 rounded-2xl px-1 py-3 active:bg-surface-light/70"
      accessibilityRole="button"
    >
      <View
        className={`w-9 h-9 rounded-xl items-center justify-center ${
          danger ? "bg-red-500/15" : "bg-surface-light"
        }`}
      >
        <Icon icon={icon} size={18} color={danger ? "#ef4444" : "#a1a1aa"} />
      </View>
      <View className="flex-1">
        <Text className={`text-sm font-semibold ${danger ? "text-red-400" : "text-zinc-100"}`}>
          {label}
        </Text>
        <Text className="text-zinc-500 text-xs mt-0.5">{subtitle}</Text>
      </View>
      {danger ? null : <Icon icon={ChevronRight} size={16} color="#71717a" />}
    </Pressable>
  );
}
