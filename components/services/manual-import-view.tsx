import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import {
  AlertTriangle,
  Check,
  Clapperboard,
  FileVideo,
  FolderInput,
  Tv,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/common/error-banner";
import { PickerSheet, type PickerOption } from "@/components/ui/picker-sheet";
import { useRefreshSpinner } from "@/components/common/pull-to-refresh";
import { useModalFlow } from "@/hooks/use-modal-flow";
import {
  manualImportServiceName,
  useArrQualityDefinitions,
  useManualImportCandidates,
  useManualImportLibrary,
  useRunManualImport,
} from "@/hooks/use-manual-import";
import { useSonarrEpisodes } from "@/hooks/use-sonarr";
import {
  qualityFromDefinition,
  qualityLabel,
  type ManualImportRow,
  type ManualImportService,
} from "@/lib/manual-import";
import { formatBytes, formatEpisodeCode } from "@/lib/utils";
import { lightHaptic } from "@/lib/haptics";
import type { ArrQualityModel } from "@/lib/types";

interface ManualImportViewProps {
  service: ManualImportService;
  /** Download-client id of the stuck grab — the /manualimport lookup key. */
  downloadId: string;
  instanceId?: string;
  /** Release name of the grab, shown so the user knows what they are mapping. */
  releaseTitle?: string;
}

// The picker chain. `season`/`episodes`/`quality` carry the file they act on;
// `media` is screen-wide (a download folder belongs to one series or movie).
type PickerStep = {
  media: void;
  season: number;
  episodes: { candidateId: number; season: number };
  quality: number;
};

/**
 * Manual import (#306) — map a stuck download's files by hand and import them.
 *
 * The one-tap Force import in the queue-issues sheet (#325) only works when
 * *arr matched the files itself. When the release is named in a way it cannot
 * parse, `/manualimport` comes back with no series/movie and no episodes, and
 * force import correctly refuses rather than importing nothing. This screen is
 * that case: pick the destination, map each file to its episodes, and send the
 * same ManualImport command with the mapping filled in.
 *
 * Radarr and Sonarr differ only in what a file needs to be importable — a
 * movie, versus a series plus at least one episode — so the branches here are
 * narrow and the payload shapes live in lib/manual-import.ts.
 */
export function ManualImportView({
  service,
  downloadId,
  instanceId,
  releaseTitle,
}: ManualImportViewProps) {
  const isSonarr = service === "sonarr";
  const serviceName = manualImportServiceName(service);

  const candidatesQuery = useManualImportCandidates(service, downloadId, instanceId);
  const candidates = candidatesQuery.data;

  const library = useManualImportLibrary(service, instanceId);
  const importMutation = useRunManualImport(service, downloadId, instanceId);

  // Destination: the series (Sonarr) or movie (Radarr) every file goes to.
  const [mediaId, setMediaId] = useState<number>();
  // Per-file mapping, keyed by candidate id.
  const [episodeIds, setEpisodeIds] = useState<Record<number, number[]>>({});
  const [qualities, setQualities] = useState<Record<number, ArrQualityModel>>({});
  const [included, setIncluded] = useState<Record<number, boolean>>({});

  // Episodes of the chosen series, for the season/episode pickers. seriesId 0
  // disables the query, which is how the Radarr side never fetches them.
  const episodesQuery = useSonarrEpisodes(
    isSonarr ? (mediaId ?? 0) : 0,
    instanceId,
  );
  const episodes = useMemo(() => episodesQuery.data ?? [], [episodesQuery.data]);

  // Only fetched once a quality picker is actually opened — most files already
  // carry a parsed quality, so this is usually never requested.
  const [qualityAsked, setQualityAsked] = useState(false);
  const qualityQuery = useArrQualityDefinitions(service, qualityAsked, instanceId);

  // Seed the mapping from what *arr resolved on its own, once per fetch. A
  // pull-to-refresh re-arms this so the screen genuinely reloads from the
  // server instead of keeping selections that no longer match the new ids.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !candidates?.length) return;
    seeded.current = true;
    setMediaId(candidates.find((c) => c.mediaId)?.mediaId);
    setEpisodeIds(
      Object.fromEntries(
        candidates.filter((c) => c.episodeIds.length).map((c) => [c.id, c.episodeIds]),
      ),
    );
    // Radarr has no per-file mapping to imply intent, so inclusion is explicit:
    // start with the files Radarr matched, or the largest one when it matched
    // none (sample and subtitle files are exactly what the user is deselecting).
    const matched = candidates.filter((c) => c.mediaId);
    const seedIncluded = matched.length
      ? matched
      : candidates.slice().sort((a, b) => b.size - a.size).slice(0, 1);
    setIncluded(Object.fromEntries(seedIncluded.map((c) => [c.id, true])));
  }, [candidates]);

  const { refreshing, onRefresh } = useRefreshSpinner(async () => {
    seeded.current = false;
    await candidatesQuery.refetch();
  });

  const flow = useModalFlow<PickerStep>();

  const mediaOptions = useMemo<PickerOption[]>(
    () =>
      library.entries.map((entry) => ({
        value: entry.id,
        label: entry.title,
        description: entry.year ? String(entry.year) : undefined,
      })),
    [library.entries],
  );

  const seasonOptions = useMemo<PickerOption[]>(() => {
    const counts = new Map<number, number>();
    for (const ep of episodes) {
      counts.set(ep.seasonNumber, (counts.get(ep.seasonNumber) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([season, count]) => ({
        value: season,
        label: season === 0 ? "Specials" : `Season ${season}`,
        description: count === 1 ? "1 episode" : `${count} episodes`,
      }));
  }, [episodes]);

  const seasonStep = flow.payload("season");
  const episodeStep = flow.payload("episodes");
  const episodeOptions = useMemo<PickerOption[]>(() => {
    if (!episodeStep) return [];
    return episodes
      .filter((ep) => ep.seasonNumber === episodeStep.season)
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((ep) => ({
        value: ep.id,
        label: `${formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)} · ${ep.title}`,
        description: ep.hasFile ? "Already has a file" : undefined,
      }));
  }, [episodes, episodeStep]);

  const qualityOptions = useMemo<PickerOption[]>(
    () =>
      (qualityQuery.data ?? [])
        .slice()
        .sort((a, b) => a.weight - b.weight)
        .map((definition) => ({
          value: definition.quality.id,
          label: definition.quality.name,
          description: definition.quality.resolution
            ? `${definition.quality.resolution}p`
            : undefined,
        })),
    [qualityQuery.data],
  );

  // Seasons the file is already mapped into, so reopening the season picker
  // shows where it currently points instead of a blank list.
  function mappedSeasons(candidateId: number): number[] {
    const mapped = episodeIds[candidateId] ?? [];
    const seasons = new Set<number>();
    for (const id of mapped) {
      const ep = episodes.find((e) => e.id === id);
      if (ep) seasons.add(ep.seasonNumber);
    }
    return [...seasons];
  }

  const mediaTitle = useMemo(
    () => library.entries.find((entry) => entry.id === mediaId)?.title,
    [library.entries, mediaId],
  );

  // Everything the Import button will send. A file that isn't importable —
  // no episode mapped, no quality, deselected — is simply left out.
  const rows = useMemo<ManualImportRow[]>(() => {
    if (!candidates || !mediaId) return [];
    const out: ManualImportRow[] = [];
    for (const candidate of candidates) {
      const quality = qualities[candidate.id] ?? candidate.quality;
      if (!quality) continue;
      if (isSonarr) {
        const eps = episodeIds[candidate.id] ?? [];
        if (eps.length === 0) continue;
        out.push({ candidate, mediaId, quality, episodeIds: eps });
      } else {
        if (!included[candidate.id]) continue;
        out.push({ candidate, mediaId, quality, episodeIds: [] });
      }
    }
    return out;
  }, [candidates, mediaId, qualities, episodeIds, included, isSonarr]);

  function pickMedia(value: number) {
    // A different destination invalidates every episode mapping — those ids
    // belong to the previous series.
    if (value !== mediaId) setEpisodeIds({});
    setMediaId(value);
    flow.close();
  }

  function toggleEpisode(candidateId: number, episodeId: number) {
    setEpisodeIds((prev) => {
      const current = prev[candidateId] ?? [];
      return {
        ...prev,
        [candidateId]: current.includes(episodeId)
          ? current.filter((id) => id !== episodeId)
          : [...current, episodeId],
      };
    });
  }

  function pickQuality(candidateId: number, qualityId: number) {
    const definition = (qualityQuery.data ?? []).find(
      (d) => d.quality.id === qualityId,
    );
    if (definition) {
      setQualities((prev) => ({
        ...prev,
        [candidateId]: qualityFromDefinition(definition.quality),
      }));
    }
    flow.close();
  }

  function openQuality(candidateId: number) {
    setQualityAsked(true);
    flow.open("quality", candidateId);
  }

  // The import runs async on the server, so leaving right away is correct: the
  // queue screen behind picks the result up on its next poll.
  function runImport() {
    importMutation.mutate(rows, { onSuccess: () => flow.back() });
  }

  if (candidatesQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#a1a1aa" />
      </View>
    );
  }

  return (
    <>
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-3 pb-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={["#3b82f6"]}
          />
        }
      >
        {releaseTitle ? (
          <Text className="text-zinc-500 text-xs" numberOfLines={2}>
            {releaseTitle}
          </Text>
        ) : null}

        {candidatesQuery.isError ? (
          <ErrorBanner
            error={candidatesQuery.error}
            title={`${serviceName} couldn't list this download's files`}
          />
        ) : null}

        {/* Destination — one series or movie for the whole download folder. */}
        <Pressable
          onPress={() => {
            lightHaptic();
            flow.open("media");
          }}
          className="flex-row items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 active:opacity-70"
        >
          <Icon icon={isSonarr ? Tv : Clapperboard} size={18} color="#a1a1aa" />
          <View className="flex-1">
            <Text className="text-zinc-500 text-xs">
              {isSonarr ? "Series" : "Movie"}
            </Text>
            <Text
              className={`text-sm font-semibold ${
                mediaTitle ? "text-zinc-100" : "text-amber-200"
              }`}
              numberOfLines={2}
            >
              {mediaTitle ?? `Choose the ${isSonarr ? "series" : "movie"}`}
            </Text>
          </View>
        </Pressable>

        {candidates?.length ? (
          <Text className="text-zinc-400 text-sm font-semibold mt-1">
            {candidates.length === 1 ? "1 file" : `${candidates.length} files`}
          </Text>
        ) : null}

        {candidates?.length === 0 && !candidatesQuery.isError ? (
          <EmptyState
            icon={<Icon icon={FileVideo} size={24} color="#71717a" />}
            title="No files to import"
            message={`${serviceName} found nothing in this download's folder. It may already have been imported or moved.`}
          />
        ) : null}

        {(candidates ?? []).map((candidate) => {
          const quality = qualities[candidate.id] ?? candidate.quality;
          const mappedEpisodes = episodeIds[candidate.id] ?? [];
          const willImport = rows.some((row) => row.candidate.id === candidate.id);
          const episodeText = mappedEpisodes
            .map((id) => {
              const ep = episodes.find((e) => e.id === id);
              return ep
                ? formatEpisodeCode(ep.seasonNumber, ep.episodeNumber)
                : `#${id}`;
            })
            .join(", ");

          return (
            <View
              key={candidate.id}
              className={`rounded-2xl border p-3 gap-2 ${
                willImport ? "border-primary/40 bg-primary/5" : "border-border bg-surface"
              }`}
            >
              <View className="flex-row items-start gap-2">
                <View className="pt-0.5">
                  <Icon
                    icon={willImport ? Check : FileVideo}
                    size={16}
                    color={willImport ? "#3b82f6" : "#71717a"}
                  />
                </View>
                <Text className="text-zinc-100 text-sm flex-1" numberOfLines={3}>
                  {candidate.name}
                </Text>
              </View>

              <View className="flex-row items-center gap-2 flex-wrap">
                {candidate.size > 0 ? (
                  <Text className="text-zinc-500 text-xs">
                    {formatBytes(candidate.size)}
                  </Text>
                ) : null}
                <Pressable
                  onPress={() => {
                    lightHaptic();
                    openQuality(candidate.id);
                  }}
                  className="rounded-full border border-border px-2.5 py-1 active:opacity-70"
                >
                  <Text
                    className={`text-xs ${
                      quality ? "text-zinc-300" : "text-amber-200"
                    }`}
                  >
                    {qualityLabel(quality)}
                  </Text>
                </Pressable>
              </View>

              {candidate.rejections.map((reason) => (
                <View key={reason} className="flex-row items-start gap-1.5">
                  <View className="pt-0.5">
                    <Icon icon={AlertTriangle} size={12} color="#fbbf24" />
                  </View>
                  <Text className="text-amber-200/90 text-xs flex-1">{reason}</Text>
                </View>
              ))}

              {isSonarr ? (
                <Pressable
                  onPress={() => {
                    lightHaptic();
                    // Nothing to map episodes against yet — send the user to
                    // the destination picker instead of an empty season list.
                    if (mediaId) flow.open("season", candidate.id);
                    else flow.open("media");
                  }}
                  className="flex-row items-center justify-between rounded-xl bg-surface-light px-3 py-2 active:opacity-70"
                >
                  <Text className="text-zinc-500 text-xs">Episodes</Text>
                  <Text
                    className={`text-sm font-semibold ${
                      episodeText ? "text-zinc-100" : "text-amber-200"
                    }`}
                    numberOfLines={1}
                  >
                    {episodeText || "Choose"}
                  </Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => {
                    lightHaptic();
                    setIncluded((prev) => ({
                      ...prev,
                      [candidate.id]: !prev[candidate.id],
                    }));
                  }}
                  className="flex-row items-center justify-between rounded-xl bg-surface-light px-3 py-2 active:opacity-70"
                >
                  <Text className="text-zinc-500 text-xs">Import this file</Text>
                  <Icon
                    icon={Check}
                    size={16}
                    color={included[candidate.id] ? "#3b82f6" : "#52525b"}
                  />
                </Pressable>
              )}
            </View>
          );
        })}
      </ScrollView>

      <View className="pt-3">
        <Button
          label={
            rows.length === 0
              ? "Import"
              : rows.length === 1
                ? "Import 1 file"
                : `Import ${rows.length} files`
          }
          size="lg"
          icon={<Icon icon={FolderInput} size={18} color="#ffffff" />}
          disabled={rows.length === 0 || importMutation.isPending}
          loading={importMutation.isPending}
          onPress={runImport}
        />
      </View>

      <PickerSheet
        {...flow.bind("media")}
        title={isSonarr ? "Choose series" : "Choose movie"}
        options={mediaOptions}
        selected={mediaId === undefined ? [] : [mediaId]}
        loading={library.isLoading}
        searchable
        emptyTitle={isSonarr ? "No series" : "No movies"}
        emptyMessage={`${serviceName} has nothing in its library yet.`}
        onPick={pickMedia}
      />

      <PickerSheet
        {...flow.bind("season")}
        title="Choose season"
        options={seasonOptions}
        selected={seasonStep === undefined ? [] : mappedSeasons(seasonStep)}
        loading={episodesQuery.isLoading}
        emptyTitle="No seasons"
        emptyMessage={`${serviceName} has no episodes for this series yet.`}
        onPick={(season) => {
          const candidateId = flow.payload("season");
          if (candidateId === undefined) return;
          // Switching season drops the old season's episodes, so a file can
          // never end up mapped across two seasons.
          const current = mappedSeasons(candidateId);
          if (current.length !== 1 || current[0] !== season) {
            setEpisodeIds((prev) => ({ ...prev, [candidateId]: [] }));
          }
          // Chaining picker to picker: the flow presents the episode list only
          // once this sheet is fully dismissed (see hooks/use-modal-flow.ts).
          flow.open("episodes", { candidateId, season });
        }}
      />

      <PickerSheet
        {...flow.bind("episodes")}
        title="Choose episodes"
        options={episodeOptions}
        selected={episodeStep ? (episodeIds[episodeStep.candidateId] ?? []) : []}
        multiple
        emptyTitle="No episodes"
        onPick={(episodeId) => {
          if (!episodeStep) return;
          toggleEpisode(episodeStep.candidateId, episodeId);
        }}
      />

      <PickerSheet
        {...flow.bind("quality")}
        title="Choose quality"
        options={qualityOptions}
        selected={(() => {
          const candidateId = flow.payload("quality");
          if (candidateId === undefined) return [];
          const current =
            qualities[candidateId] ??
            candidates?.find((c) => c.id === candidateId)?.quality;
          return current?.quality?.id === undefined ? [] : [current.quality.id];
        })()}
        loading={qualityQuery.isLoading}
        emptyTitle="No qualities"
        onPick={(qualityId) => {
          const candidateId = flow.payload("quality");
          if (candidateId === undefined) return;
          pickQuality(candidateId, qualityId);
        }}
      />
    </>
  );
}
