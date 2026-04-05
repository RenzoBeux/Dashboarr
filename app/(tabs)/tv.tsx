import { useState } from "react";
import { View, Text, Pressable, Image } from "react-native";
import { useRouter } from "expo-router";
import { Search, Tv } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterChip } from "@/components/ui/filter-chip";
import { Skeleton, SkeletonCardContent } from "@/components/ui/skeleton";
import { ICON } from "@/lib/constants";
import { useSonarrSeries, useSonarrCalendar } from "@/hooks/use-sonarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { formatEpisodeCode, relativeDate } from "@/lib/utils";
import { useServiceImage } from "@/hooks/use-service-image";
import type { SonarrSeries, SonarrCalendarEntry } from "@/lib/types";

type Tab = "library" | "calendar";

export default function TVScreen() {
  const [tab, setTab] = useState<Tab>("library");
  const router = useRouter();
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["sonarr"]]);

  const sonarrHealth = healthData?.find((s) => s.id === "sonarr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <View className="flex-row items-center justify-between">
        <ServiceHeader name="TV Shows" online={sonarrHealth?.online} />
        <Pressable
          onPress={() => router.push("/series/search")}
          className="p-2 active:opacity-70"
        >
          <Search size={ICON.LG} color="#a1a1aa" />
        </Pressable>
      </View>

      <View className="flex-row gap-2 mb-4">
        {(["library", "calendar"] as Tab[]).map((t) => (
          <FilterChip
            key={t}
            label={t.charAt(0).toUpperCase() + t.slice(1)}
            selected={tab === t}
            onPress={() => setTab(t)}
          />
        ))}
      </View>

      {tab === "library" && <SeriesLibrary />}
      {tab === "calendar" && <CalendarView />}
    </ScreenWrapper>
  );
}

function SeriesLibrary() {
  const { data: series, isLoading } = useSonarrSeries();
  const router = useRouter();

  if (isLoading) {
    return (
      <View className="flex-row flex-wrap gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} className="w-[30%]">
            <Skeleton width="100%" height={150} borderRadius={12} />
            <Skeleton width="75%" height={10} borderRadius={4} className="mt-1.5" />
          </View>
        ))}
      </View>
    );
  }
  if (!series?.length) {
    return <EmptyState icon={<Tv size={32} color="#71717a" />} title="No shows in library" />;
  }

  const sorted = [...series].sort(
    (a, b) => new Date(b.added).getTime() - new Date(a.added).getTime(),
  );

  return (
    <View className="flex-row flex-wrap gap-3">
      {sorted.map((show) => (
        <SeriesPoster
          key={show.id}
          series={show}
          onPress={() => router.push(`/series/${show.id}`)}
        />
      ))}
    </View>
  );
}

function SeriesPoster({
  series,
  onPress,
}: {
  series: SonarrSeries;
  onPress: () => void;
}) {
  const poster = series.images.find((i) => i.coverType === "poster");
  const { src, onError } = useServiceImage(poster, "sonarr");

  return (
    <Pressable onPress={onPress} className="w-[30%] active:opacity-80">
      {src ? (
        <Image
          source={{ uri: src }}
          className="w-full aspect-[2/3] rounded-xl bg-surface-light"
          resizeMode="cover"
          onError={onError}
        />
      ) : (
        <View className="w-full aspect-[2/3] rounded-xl bg-surface-light items-center justify-center">
          <Tv size={24} color="#71717a" />
        </View>
      )}
      <Text className="text-zinc-300 text-xs mt-1" numberOfLines={1}>
        {series.title}
      </Text>
      <Text className="text-zinc-600 text-[10px]">
        {series.seasonCount} season{series.seasonCount !== 1 ? "s" : ""}
      </Text>
    </Pressable>
  );
}

function CalendarView() {
  const { data: episodes, isLoading } = useSonarrCalendar();
  const router = useRouter();

  if (isLoading) return <SkeletonCardContent rows={4} />;
  if (!episodes?.length) {
    return <EmptyState title="Nothing airing this week" />;
  }

  // Group by date
  const grouped = new Map<string, SonarrCalendarEntry[]>();
  for (const ep of episodes) {
    const list = grouped.get(ep.airDate) ?? [];
    list.push(ep);
    grouped.set(ep.airDate, list);
  }

  const sortedDates = Array.from(grouped.keys()).sort();

  return (
    <View className="gap-4">
      {sortedDates.map((date) => {
        const entries = grouped.get(date)!;
        const isToday = date === new Date().toISOString().split("T")[0];

        return (
          <View key={date}>
            <Text
              className={`text-xs font-semibold mb-2 ${
                isToday ? "text-primary" : "text-zinc-500"
              }`}
            >
              {relativeDate(date)}
            </Text>
            <View className="gap-2">
              {entries.map((ep) => (
                <Card
                  key={ep.id}
                  onPress={() => router.push(`/series/${ep.seriesId}`)}
                >
                  <View className="flex-row items-center gap-2">
                    <View
                      className={`w-1 h-10 rounded-full ${
                        ep.hasFile ? "bg-success" : "bg-zinc-600"
                      }`}
                    />
                    <View className="flex-1">
                      <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                        {ep.series.title}
                      </Text>
                      <Text className="text-zinc-500 text-xs">
                        {formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)} —{" "}
                        {ep.title}
                      </Text>
                    </View>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}
