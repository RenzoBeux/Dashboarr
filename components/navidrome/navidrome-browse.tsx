import { View, Text, Pressable } from "react-native";
import { Disc, Search, User } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { TextInput } from "@/components/ui/text-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { PosterSkeletonRow } from "@/components/dashboard/poster-skeleton-row";
import { MediaPosterTile } from "@/components/dashboard/media-poster-tile";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePosterCellLayout } from "@/hooks/use-poster-cell";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { useNavidromeAlbums, useNavidromeSearch } from "@/hooks/use-navidrome";
import { getCoverArtSource } from "@/services/navidrome-api";
import { openNavidromeWebUi } from "@/components/navidrome/open-web-ui";
import { ICON } from "@/lib/constants";
import type { NavidromeAlbum, NavidromeArtist, NavidromeSong } from "@/lib/types";

// Navidrome's search is a prefix autocomplete (no Lucene), so a single letter
// matches most of a library — the hook gates on 2+ characters for the same
// reason app/search.tsx does.
const MIN_QUERY = 2;

/**
 * Browse tab: recently-added albums by default, search3 results while typing.
 * Album art is square, so the tiles are square rather than the 2:3 poster shape
 * the movie/TV grids use.
 */
export function NavidromeBrowse({
  query,
  onQueryChange,
  instanceId,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  instanceId?: string;
}) {
  const debounced = useDebouncedValue(query.trim(), 300);
  const searching = debounced.length >= MIN_QUERY;

  const { instanceId: resolvedInstanceId } = useInstanceTarget("navidrome", instanceId);
  const albums = useNavidromeAlbums("newest", 24, instanceId);
  const search = useNavidromeSearch(debounced, instanceId);
  const { width: cellWidth, gap } = usePosterCellLayout();

  const results = search.data;
  const error = searching ? search.error : albums.error;
  const loading = searching ? search.isLoading : albums.isLoading;

  return (
    <View className="gap-4">
      <TextInput
        value={query}
        onChangeText={onQueryChange}
        placeholder="Search artists, albums and tracks"
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="while-editing"
      />

      {error ? <ErrorBanner error={error} /> : null}

      {loading ? (
        <PosterSkeletonRow count={3} />
      ) : searching ? (
        <SearchResults
          results={results}
          cellWidth={cellWidth}
          gap={gap}
          instanceId={resolvedInstanceId ?? ""}
        />
      ) : (
        <AlbumGrid
          title="Recently added"
          albums={albums.data ?? []}
          cellWidth={cellWidth}
          gap={gap}
          instanceId={resolvedInstanceId ?? ""}
        />
      )}
    </View>
  );
}

function SearchResults({
  results,
  cellWidth,
  gap,
  instanceId,
}: {
  results: { artist?: NavidromeArtist[]; album?: NavidromeAlbum[]; song?: NavidromeSong[] } | undefined;
  cellWidth: number;
  gap: number;
  instanceId: string;
}) {
  const artists = results?.artist ?? [];
  const albums = results?.album ?? [];
  const songs = results?.song ?? [];

  if (artists.length === 0 && albums.length === 0 && songs.length === 0) {
    return (
      <EmptyState
        icon={<Icon icon={Search} size={ICON.XL} color="#52525b" />}
        title="No matches"
        message="Navidrome matches from the start of a word, so try a shorter term."
      />
    );
  }

  return (
    <View className="gap-5">
      {albums.length > 0 && (
        <AlbumGrid
          title="Albums"
          albums={albums}
          cellWidth={cellWidth}
          gap={gap}
          instanceId={instanceId}
        />
      )}
      {artists.length > 0 && (
        <View className="gap-2">
          <SectionTitle title="Artists" count={artists.length} />
          {artists.map((artist) => (
            <ResultRow
              key={artist.id}
              icon={User}
              title={artist.name}
              subtitle={
                artist.albumCount
                  ? `${artist.albumCount} album${artist.albumCount !== 1 ? "s" : ""}`
                  : undefined
              }
              onPress={() => openNavidromeWebUi("artist", artist.id, instanceId)}
            />
          ))}
        </View>
      )}
      {songs.length > 0 && (
        <View className="gap-2">
          <SectionTitle title="Tracks" count={songs.length} />
          {songs.map((song) => (
            <ResultRow
              key={song.id}
              icon={Disc}
              title={song.title}
              subtitle={[song.artist, song.album].filter(Boolean).join(" · ")}
              onPress={() => openNavidromeWebUi("album", song.albumId, instanceId)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function AlbumGrid({
  title,
  albums,
  cellWidth,
  gap,
  instanceId,
}: {
  title: string;
  albums: NavidromeAlbum[];
  cellWidth: number;
  gap: number;
  instanceId: string;
}) {
  if (albums.length === 0) {
    return <EmptyState compact title="No albums yet" />;
  }
  return (
    <View className="gap-2">
      <SectionTitle title={title} count={albums.length} />
      <View className="flex-row flex-wrap" style={{ gap }}>
        {albums.map((album) => (
          <MediaPosterTile
            key={album.id}
            // Square: album art is 1:1, unlike the 2:3 movie/TV posters.
            // prescaled because usePosterCellLayout already folded useUiScale
            // into this width; scaling it again overflows the row and collapses
            // the grid to one column at scale >= 1.15.
            width={cellWidth}
            height={cellWidth}
            prescaled
            posterUrl={getCoverArtSource(album.coverArt, 300, instanceId)}
            title={album.name}
            subtitle={album.artist}
            mediaType="music"
            onPress={() => openNavidromeWebUi("album", album.id, instanceId)}
          />
        ))}
      </View>
    </View>
  );
}

function SectionTitle({ title, count }: { title: string; count: number }) {
  return (
    <View className="flex-row items-baseline gap-2">
      <Text className="text-zinc-100 text-base font-semibold">{title}</Text>
      <Text className="text-zinc-500 text-xs">{count}</Text>
    </View>
  );
}

function ResultRow({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="flex-row items-center gap-3 rounded-xl bg-surface-light border border-border px-3 py-2.5 active:opacity-70"
    >
      <Icon icon={icon} size={ICON.MD} color="#a1a1aa" />
      <View className="flex-1">
        <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
          {title}
        </Text>
        {!!subtitle && (
          <Text className="text-zinc-500 text-xs" numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}
