import { Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Image } from "expo-image";
import { Check, ChevronRight, ExternalLink, Film, Music, Tv } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ErrorBanner } from "@/components/common/error-banner";
import { MediaDetailHero } from "@/components/common/media-detail-hero";
import { MediaDetailSkeleton } from "@/components/common/media-detail-skeleton";
import { MediaActionBar, type MediaActionItem } from "@/components/common/media-action-bar";
import { MediaStatsStrip, type MediaStat } from "@/components/common/media-stats-strip";
import { ExpandableText } from "@/components/common/expandable-text";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { openInPlex } from "@/components/plex/open-in-plex";
import { plexItemHref } from "@/components/plex/plex-poster-cell";
import { usePlexChildren, usePlexMachineIdentifier, usePlexMetadata } from "@/hooks/use-plex";
import { getPlexImageSource, getPlexImageUrl } from "@/services/plex-api";
import {
  plexBackdropPath,
  plexChildSubtitle,
  plexHasChildren,
  plexIsWatched,
  plexMetaLine,
  plexPosterPath,
  plexResolutionLabel,
  plexRuntimeLabel,
} from "@/lib/plex-items";
import type { PlexMediaItem } from "@/lib/types";

const CHILDREN_LABEL: Partial<Record<PlexMediaItem["type"], string>> = {
  show: "Seasons",
  season: "Episodes",
  artist: "Albums",
  album: "Tracks",
};

export default function PlexItemScreen() {
  const { ratingKey: param } = useLocalSearchParams<{ ratingKey: string }>();
  const ratingKey = String(param ?? "");
  const router = useRouter();
  const { data: item, isLoading, error } = usePlexMetadata(ratingKey);
  const hasChildren = item ? plexHasChildren(item) : false;
  const children = usePlexChildren(ratingKey, hasChildren);
  const { data: machineIdentifier } = usePlexMachineIdentifier();
  const { refreshing, onRefresh } = usePullToRefresh([["plex"]]);

  if (isLoading) return <MediaDetailSkeleton />;
  if (error) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <ErrorBanner error={error} title="Failed to load from Plex" className="mt-4" />
      </ScreenWrapper>
    );
  }
  if (!item) {
    return (
      <ScreenWrapper>
        <BackHeader />
        <EmptyState title="Not found in Plex" />
      </ScreenWrapper>
    );
  }

  const isMusic = item.type === "artist" || item.type === "album" || item.type === "track";
  const watched = plexIsWatched(item);
  const actions: MediaActionItem[] = [
    {
      key: "open",
      icon: ExternalLink,
      label: "Open in Plex",
      disabled: !machineIdentifier,
      onPress: () => {
        if (machineIdentifier) void openInPlex(machineIdentifier, item.ratingKey);
      },
    },
  ];
  const parents = parentLinks(item);
  const genres = item.Genre?.map((g) => g.tag).filter(Boolean) ?? [];
  const childLabel = CHILDREN_LABEL[item.type] ?? "Items";

  return (
    <ScreenWrapper edgeToEdge refreshing={refreshing} onRefresh={onRefresh}>
      <MediaDetailHero
        backdropUrl={getPlexImageUrl(plexBackdropPath(item), 1280, 720)}
        posterUrl={getPlexImageUrl(plexPosterPath(item), 300, 450)}
        title={item.title}
        metaLine={plexMetaLine(item)}
        ratings={{ value: item.audienceRating ?? item.rating }}
        posterFallbackIcon={isMusic ? Music : item.type === "movie" ? Film : Tv}
        badges={
          item.contentRating || watched ? (
            <>
              {item.contentRating ? <Badge label={item.contentRating} variant="default" /> : null}
              {watched ? <Badge label="Watched" variant="success" /> : null}
            </>
          ) : undefined
        }
      />

      <View className="px-4 mt-6">
        <MediaActionBar actions={actions} className="mb-4" />

        <MediaStatsStrip stats={buildStats(item, children.data)} className="mb-5" />

        {parents.length > 0 ? (
          <View className="mb-5 gap-2">
            <SectionLabel>Part of</SectionLabel>
            {parents.map((parent) => (
              <Pressable
                key={parent.ratingKey}
                onPress={() => router.push(plexItemHref(parent.ratingKey))}
                accessibilityRole="button"
                accessibilityLabel={parent.title}
                className="flex-row items-center rounded-xl bg-surface-light border border-border px-3 py-2.5 active:opacity-70"
              >
                <Text className="text-zinc-200 text-sm flex-1" numberOfLines={1}>
                  {parent.title}
                </Text>
                <Icon icon={ChevronRight} size={16} color="#71717a" />
              </Pressable>
            ))}
          </View>
        ) : null}

        {item.summary ? (
          <View className="mb-5">
            <SectionLabel>Overview</SectionLabel>
            <ExpandableText text={item.summary} numberOfLines={4} />
          </View>
        ) : null}

        {genres.length > 0 ? (
          <View className="mb-5">
            <SectionLabel>Genres</SectionLabel>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              {genres.map((g) => (
                <Badge key={g} label={g} variant="default" />
              ))}
            </ScrollView>
          </View>
        ) : null}

        {hasChildren ? (
          <View className="mb-5">
            <SectionLabel>{childLabel}</SectionLabel>
            {children.isLoading ? (
              <SkeletonCardContent rows={4} />
            ) : children.error ? (
              <ErrorBanner error={children.error} title={`Failed to load ${childLabel.toLowerCase()}`} />
            ) : (children.data?.length ?? 0) === 0 ? (
              <EmptyState compact title={`No ${childLabel.toLowerCase()}`} />
            ) : (
              <View className="gap-2">
                {children.data!.map((child) => (
                  <ChildRow
                    key={child.ratingKey}
                    item={child}
                    onPress={() => router.push(plexItemHref(child.ratingKey))}
                  />
                ))}
              </View>
            )}
          </View>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="text-zinc-500 text-[0.65rem] font-bold uppercase tracking-widest mb-2 ml-1">
      {children}
    </Text>
  );
}

// Episodes link up to their season and show, seasons to their show, albums
// to their artist and tracks to their album, so an episode opened from
// Recently Added can reach the rest of the series.
function parentLinks(item: PlexMediaItem): { ratingKey: string; title: string }[] {
  const links: { ratingKey: string; title: string }[] = [];
  if (item.grandparentRatingKey && item.grandparentTitle) {
    links.push({ ratingKey: item.grandparentRatingKey, title: item.grandparentTitle });
  }
  if (item.parentRatingKey && item.parentTitle) {
    links.push({ ratingKey: item.parentRatingKey, title: item.parentTitle });
  }
  return links;
}

function buildStats(item: PlexMediaItem, children?: PlexMediaItem[]): MediaStat[] {
  const media = item.Media?.[0];
  const quality = plexResolutionLabel(media?.videoResolution);
  const runtime = plexRuntimeLabel(item.duration);
  const episodesWatched =
    item.leafCount !== undefined ? `${item.viewedLeafCount ?? 0}/${item.leafCount}` : undefined;
  const stats: (MediaStat | false)[] = (() => {
    switch (item.type) {
      case "movie":
        return [
          !!runtime && { label: "Runtime", value: runtime },
          !!quality && { label: "Quality", value: quality },
          { label: "Plays", value: String(item.viewCount ?? 0) },
        ];
      case "episode":
        return [
          !!runtime && { label: "Runtime", value: runtime },
          !!quality && { label: "Quality", value: quality },
          !!item.originallyAvailableAt && { label: "Aired", value: item.originallyAvailableAt },
        ];
      case "show":
        return [
          item.childCount !== undefined && { label: "Seasons", value: String(item.childCount) },
          item.leafCount !== undefined && { label: "Episodes", value: String(item.leafCount) },
          !!episodesWatched && { label: "Watched", value: episodesWatched },
        ];
      case "season":
        return [
          item.leafCount !== undefined && { label: "Episodes", value: String(item.leafCount) },
          !!episodesWatched && { label: "Watched", value: episodesWatched },
        ];
      case "artist":
        return [!!children && { label: "Albums", value: String(children.length) }];
      case "album":
        return [
          item.leafCount !== undefined && { label: "Tracks", value: String(item.leafCount) },
          !!item.year && { label: "Year", value: String(item.year) },
        ];
      default:
        return [!!runtime && { label: "Duration", value: runtime }];
    }
  })();
  return stats.filter((s): s is MediaStat => !!s);
}

function ChildRow({ item, onPress }: { item: PlexMediaItem; onPress: () => void }) {
  // Episodes get their 16:9 still; everything else its poster or cover.
  const isEpisode = item.type === "episode";
  const isTrack = item.type === "track";
  const imageSource = isTrack
    ? null
    : isEpisode
      ? getPlexImageSource(item.thumb, 192, 108)
      : getPlexImageSource(plexPosterPath(item), 80, 120);
  const numbered = (isEpisode || isTrack) && item.index !== undefined;
  const title = numbered ? `${item.index}. ${item.title}` : item.title;
  const subtitle = plexChildSubtitle(item);
  const watched = plexIsWatched(item);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-3 rounded-xl bg-surface-light border border-border px-3 py-2.5 active:opacity-70"
    >
      {isTrack ? null : (
        <View
          className={`rounded-md overflow-hidden bg-surface items-center justify-center ${
            isEpisode ? "w-24 h-[3.375rem]" : "w-10 h-[3.75rem]"
          }`}
        >
          {imageSource ? (
            <Image
              source={imageSource}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={imageSource.cacheKey}
            />
          ) : (
            <Icon icon={item.type === "album" ? Music : Tv} size={16} color="#52525b" />
          )}
        </View>
      )}
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm" numberOfLines={isEpisode ? 2 : 1}>
          {title}
        </Text>
        {subtitle ? (
          <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {watched ? <Icon icon={Check} size={14} color="#22c55e" /> : null}
      <Icon icon={ChevronRight} size={16} color="#71717a" />
    </Pressable>
  );
}
