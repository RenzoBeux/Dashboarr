import { View, Text, Pressable } from "react-native";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { SectionLabel } from "@/components/ui/section-label";
import { Skeleton } from "@/components/ui/skeleton";
import { SubtitleTrackChip } from "@/components/subtitles/subtitle-track-chip";
import { SubtitlesBlock } from "@/components/subtitles/subtitles-block";
import { useSubtitleActions } from "@/components/subtitles/use-subtitle-actions";
import { useBazarrMovieSubtitles } from "@/hooks/use-bazarr-subtitles";
import { useConfigStore } from "@/store/config-store";
import {
  buildSubtitleChips,
  buildSubtitleRows,
  subtitleCoverage,
} from "@/lib/subtitle-model";

/**
 * The movie page's Subtitles section, shown only when a Bazarr instance is
 * linked to the movie's Radarr (useLinkedBazarr). Collapsed it is one line of
 * chips and "present/total"; expanded it is the shared SubtitlesBlock.
 */
export function SubtitlesCard({
  bazarrId,
  radarrId,
  radarrInstanceId,
  title,
  videoFps,
}: {
  bazarrId: string;
  radarrId: number;
  radarrInstanceId?: string;
  title: string;
  videoFps?: number | null;
}) {
  const { data: movie, isLoading, error, refetch } = useBazarrMovieSubtitles(
    bazarrId,
    radarrId,
  );
  const target = { type: "movie" as const, radarrId };
  const actions = useSubtitleActions({
    bazarrId,
    target,
    item: movie ?? null,
    title,
    videoFps,
    profileTarget: { type: "movie", radarrId },
    manualSearchHref: `/movie/subtitles/${radarrId}?bazarrId=${bazarrId}${
      radarrInstanceId ? `&instanceId=${radarrInstanceId}` : ""
    }`,
  });

  const rows = movie ? buildSubtitleRows(movie) : [];
  const chips = buildSubtitleChips(rows);
  const { have, total } = subtitleCoverage(chips);

  return (
    <View className="mb-5">
      <SubtitlesSectionLabel bazarrId={bazarrId} />

      {isLoading ? (
        <Skeleton width="100%" height={52} borderRadius={16} />
      ) : error && !movie ? (
        <SubtitlesUnreachable bazarrId={bazarrId} onRetry={() => void refetch()} />
      ) : !movie ? (
        <SubtitlesNotListed bazarrId={bazarrId} kind="movie" />
      ) : (
        <CollapsibleCard
          accessibilityLabel={`Subtitles, ${have} of ${total} languages present`}
          title={
            <View className="flex-1 flex-row flex-wrap gap-x-2.5 gap-y-2 pt-1.5">
              {chips.length === 0 ? (
                <Text className="text-zinc-500 text-sm">None</Text>
              ) : (
                chips.map((c) => (
                  <SubtitleTrackChip
                    key={c.key}
                    code={c.code2}
                    state={c.state}
                    forced={c.forced}
                    hi={c.hi}
                  />
                ))
              )}
            </View>
          }
          right={
            total > 0 ? (
              <Text className="text-zinc-400 text-xs ml-2">
                <Text className="text-zinc-100 font-semibold">{have}</Text>/{total}
              </Text>
            ) : null
          }
        >
          {/* The rows run edge to edge inside the card's padding. */}
          <View className="-mx-4 -mb-4 mt-3">
            <SubtitlesBlock rows={rows} {...actions.blockProps} />
          </View>
        </CollapsibleCard>
      )}

      {actions.modals}
    </View>
  );
}

/** Bazarr hasn't synced this movie/series from Radarr/Sonarr yet. */
export function SubtitlesNotListed({
  bazarrId,
  kind,
}: {
  bazarrId: string;
  kind: "movie" | "series";
}) {
  const bazarrName = useBazarrName(bazarrId);
  return (
    <View className="rounded-2xl bg-surface border border-border px-4 py-3">
      <Text className="text-zinc-400 text-xs">
        {bazarrName} doesn&apos;t list this {kind} yet. It picks up new{" "}
        {kind === "movie" ? "Radarr movies" : "Sonarr series"} on its next sync.
      </Text>
    </View>
  );
}

/** "Couldn't reach <Bazarr>." with Retry, when its data never loaded. */
export function SubtitlesUnreachable({
  bazarrId,
  onRetry,
}: {
  bazarrId: string;
  onRetry: () => void;
}) {
  const bazarrName = useBazarrName(bazarrId);
  return (
    <View className="flex-row items-center gap-3 rounded-2xl bg-surface border border-border px-4 py-3">
      <Text className="flex-1 text-zinc-400 text-xs">Couldn&apos;t reach {bazarrName}.</Text>
      <Pressable onPress={onRetry} hitSlop={8} className="active:opacity-70" accessibilityRole="button">
        <Text className="text-primary text-xs font-semibold">Retry</Text>
      </Pressable>
    </View>
  );
}

function useBazarrName(bazarrId: string): string {
  return useConfigStore(
    (s) => s.serviceInstances.bazarr?.find((b) => b.id === bazarrId)?.name ?? "Bazarr",
  );
}

/**
 * "SUBTITLES" with the serving Bazarr instance's name on the right — the
 * heading of the movie card and the series coverage card. The name is plain
 * text on purpose: the settings editor lives in another tab's stack, so a
 * link would switch tabs.
 */
export function SubtitlesSectionLabel({ bazarrId }: { bazarrId: string }) {
  const bazarrName = useBazarrName(bazarrId);
  return (
    <View className="flex-row items-baseline justify-between">
      <SectionLabel>Subtitles</SectionLabel>
      <Text
        className="text-zinc-500 text-xs mr-1 mb-2"
        accessibilityLabel={`Subtitles come from ${bazarrName}`}
      >
        {bazarrName}
      </Text>
    </View>
  );
}
