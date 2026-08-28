import { useRouter } from "expo-router";
import { View, Text, Pressable } from "react-native";
import { Image } from "expo-image";
import { Disc, Library, Mic2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SearchSection } from "@/components/search/search-section";
import { useNavidromeSearch } from "@/hooks/use-navidrome";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { getCoverArtSource } from "@/services/navidrome-api";
import { openNavidromeWebUi } from "@/components/navidrome/open-web-ui";
import { ICON } from "@/lib/constants";
import type { NavidromeAlbum, NavidromeArtist, NavidromeSong } from "@/lib/types";

const PREVIEW_LIMIT = 6;

/**
 * Library section of global search, backed by Navidrome's search3.
 *
 * Distinct from the Lidarr "Music" section: Lidarr searches MusicBrainz for
 * artists to add, this searches what is actually on the server. Both can be
 * present at once, which is why the title says Library rather than Music.
 */
export function NavidromeSearchSection({ query }: { query: string }) {
  const router = useRouter();
  const { instanceId } = useInstanceTarget("navidrome");
  const { data, isLoading, isError, error } = useNavidromeSearch(query);

  const albums = data?.album ?? [];
  const artists = data?.artist ?? [];
  const songs = data?.song ?? [];
  const total = albums.length + artists.length + songs.length;

  // Albums first (the most recognisable hit for a music library), then artists,
  // then tracks — each capped so one very common term can't flood the section.
  const rows = [
    ...albums.map((a) => ({ kind: "album" as const, item: a })),
    ...artists.map((a) => ({ kind: "artist" as const, item: a })),
    ...songs.map((s) => ({ kind: "song" as const, item: s })),
  ].slice(0, PREVIEW_LIMIT);

  return (
    <SearchSection
      title="Library"
      icon={Library}
      serviceLabel="Navidrome"
      total={total}
      isLoading={isLoading}
      isError={isError}
      error={error}
      hasMore={total > rows.length}
      onShowAll={() =>
        // Carry the query through: the tab opens on Overview by default and
        // Browse starts empty, so pushing the bare route would drop both the
        // search and its results. Mirrors the ?source= deep link on Indexers.
        router.push({ pathname: "/(tabs)/navidrome", params: { q: query } })
      }
    >
      {rows.map((row) =>
        row.kind === "album" ? (
          <ResultRow
            key={`album:${row.item.id}`}
            art={getCoverArtSource(row.item.coverArt, 100, instanceId ?? undefined)}
            fallback={Disc}
            title={row.item.name}
            subtitle={[row.item.artist, row.item.year ? String(row.item.year) : ""]
              .filter(Boolean)
              .join(" · ")}
            onPress={() => openNavidromeWebUi("album", row.item.id, instanceId ?? undefined)}
          />
        ) : row.kind === "artist" ? (
          <ResultRow
            key={`artist:${row.item.id}`}
            art={null}
            fallback={Mic2}
            title={row.item.name}
            subtitle={
              row.item.albumCount
                ? `${row.item.albumCount} album${row.item.albumCount !== 1 ? "s" : ""}`
                : undefined
            }
            onPress={() => openNavidromeWebUi("artist", row.item.id, instanceId ?? undefined)}
          />
        ) : (
          <ResultRow
            key={`song:${row.item.id}`}
            art={getCoverArtSource(row.item.coverArt, 100, instanceId ?? undefined)}
            fallback={Disc}
            title={row.item.title}
            subtitle={[row.item.artist, row.item.album].filter(Boolean).join(" · ")}
            onPress={() => openNavidromeWebUi("album", row.item.albumId, instanceId ?? undefined)}
          />
        ),
      )}
    </SearchSection>
  );
}

function ResultRow({
  art,
  fallback,
  title,
  subtitle,
  onPress,
}: {
  art: { uri: string; cacheKey: string } | null;
  fallback: React.ComponentType<any>;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="flex-row items-center gap-3 py-2 active:opacity-70"
    >
      <View className="w-9 h-9 rounded-md overflow-hidden bg-surface-light items-center justify-center">
        {art ? (
          <Image source={art} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Icon icon={fallback} size={ICON.SM} color="#52525b" />
        )}
      </View>
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
