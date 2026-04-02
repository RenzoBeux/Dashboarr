import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { Tv } from "lucide-react-native";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useSonarrCalendar } from "@/hooks/use-sonarr";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { formatEpisodeCode, relativeDate } from "@/lib/utils";
import type { SonarrCalendarEntry } from "@/lib/types";

export function SonarrCalendarCard() {
  const { data: episodes, isLoading } = useSonarrCalendar();
  const router = useRouter();

  // Group episodes by air date
  const grouped = groupByDate(episodes ?? []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Airing Soon</CardTitle>
        {episodes && episodes.length > 0 && (
          <Text className="text-zinc-500 text-sm">{episodes.length} episodes</Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={4} />
      ) : grouped.length === 0 ? (
        <EmptyState
          icon={<Tv size={32} color="#71717a" />}
          title="Nothing airing this week"
        />
      ) : (
        <View className="gap-4">
          {grouped.map(({ date, entries }) => (
            <View key={date}>
              <Text
                className={`text-xs font-semibold mb-2 ${
                  isToday(date) ? "text-primary" : "text-zinc-500"
                }`}
              >
                {relativeDate(date)}
              </Text>
              <View className="gap-2">
                {entries.map((ep) => (
                  <Pressable
                    key={ep.id}
                    onPress={() => router.push(`/series/${ep.seriesId}`)}
                    className="active:opacity-80"
                  >
                    <View className="flex-row items-center gap-2">
                      <View
                        className={`w-1 h-8 rounded-full ${
                          ep.hasFile ? "bg-success" : "bg-zinc-600"
                        }`}
                      />
                      <View className="flex-1">
                        <Text className="text-zinc-200 text-sm" numberOfLines={1}>
                          {ep.series.title}
                        </Text>
                        <Text className="text-zinc-500 text-xs">
                          {formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)}{" "}
                          — {ep.title}
                        </Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function groupByDate(
  episodes: SonarrCalendarEntry[],
): { date: string; entries: SonarrCalendarEntry[] }[] {
  const groups = new Map<string, SonarrCalendarEntry[]>();

  for (const ep of episodes) {
    const date = ep.airDate;
    if (!groups.has(date)) {
      groups.set(date, []);
    }
    groups.get(date)!.push(ep);
  }

  return Array.from(groups.entries())
    .map(([date, entries]) => ({ date, entries }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function isToday(dateString: string): boolean {
  const today = new Date().toISOString().split("T")[0];
  return dateString === today;
}
