import { useMemo, useState } from "react";
import { toast, toastError } from "@/components/ui/toast";
import { SubtitleCoverageCard } from "@/components/subtitles/subtitle-coverage-card";
import { EpisodeSubtitlesSheet } from "@/components/subtitles/episode-subtitles-sheet";
import { useSubtitleActions } from "@/components/subtitles/use-subtitle-actions";
import { useLinkedBazarr } from "@/hooks/use-bazarr-link";
import {
  useBazarrLanguageProfiles,
  useBazarrSeriesEpisodes,
  useBazarrSeriesItem,
  useBazarrSubtitleMutation,
} from "@/hooks/use-bazarr-subtitles";
import { searchMissingSubtitles, searchSubtitles } from "@/services/bazarr-api";
import {
  buildAudioTags,
  buildCoverageGrid,
  buildSubtitleChips,
  buildSubtitleRows,
  seasonMissingTargets,
  type AudioTag,
  type SubtitleChip,
} from "@/lib/subtitle-model";
import {
  formatAudioChannels,
  formatEpisodeCode,
  formatResolution,
} from "@/lib/utils";
import type {
  BazarrEpisode,
  SonarrEpisode,
  SonarrEpisodeFile,
  SonarrSeries,
} from "@/lib/types";

/**
 * Everything the Sonarr series page shows from Bazarr, so the page only
 * places the pieces: the coverage card, per-episode language tags and season
 * gap counts for the season list, the episode subtitles sheet (with its row
 * actions), and season/series "Search missing subtitles". When no Bazarr is
 * linked to the series' Sonarr, `linked` is false and nothing renders.
 */
export function useSeriesSubtitles({
  instanceId,
  series,
  episodes,
  episodeFileMap,
}: {
  instanceId?: string;
  series: SonarrSeries | undefined;
  episodes: SonarrEpisode[] | undefined;
  episodeFileMap: Map<number, SonarrEpisodeFile>;
}) {
  const seriesId = series?.id ?? 0;
  const { bazarrId } = useLinkedBazarr("sonarr", instanceId);
  const { data: bazarrEpisodes } = useBazarrSeriesEpisodes(bazarrId, seriesId);
  const { data: bazarrSeries } = useBazarrSeriesItem(bazarrId, seriesId);
  const { data: profiles } = useBazarrLanguageProfiles(bazarrId);
  const profile = profiles?.find((p) => p.profileId === bazarrSeries?.profileId) ?? null;

  const byEpisode = useMemo(
    () => new Map((bazarrEpisodes ?? []).map((e) => [e.sonarrEpisodeId, e])),
    [bazarrEpisodes],
  );
  const sonarrById = useMemo(
    () => new Map((episodes ?? []).map((e) => [e.id, e])),
    [episodes],
  );

  const grid = useMemo(
    () => (bazarrEpisodes ? buildCoverageGrid(bazarrEpisodes, profile) : null),
    [bazarrEpisodes, profile],
  );
  const gapsBySeason = useMemo(
    () => new Map((grid?.seasons ?? []).map((s) => [s.season, s.gaps])),
    [grid],
  );

  // Audio from the file's media info (one tag per language), else Bazarr's;
  // subtitles from Bazarr.
  const audioFor = (be: BazarrEpisode | undefined, ep: SonarrEpisode | undefined): AudioTag[] => {
    const file = ep?.episodeFileId ? episodeFileMap.get(ep.episodeFileId) : undefined;
    const arr = file?.mediaInfo?.audioLanguages;
    return buildAudioTags(arr || be?.audio_language, series?.originalLanguage);
  };
  const episodeLanguages = useMemo(() => {
    const map = new Map<number, { audio: AudioTag[]; chips: SubtitleChip[] }>();
    for (const be of bazarrEpisodes ?? []) {
      map.set(be.sonarrEpisodeId, {
        audio: audioFor(be, sonarrById.get(be.sonarrEpisodeId)),
        chips: buildSubtitleChips(buildSubtitleRows(be)),
      });
    }
    return map;
    // audioFor reads episodeFileMap and series, listed below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bazarrEpisodes, sonarrById, episodeFileMap, series?.originalLanguage]);

  // --- Episode sheet ---

  const [episodeId, setEpisodeId] = useState<number | null>(null);
  const selected = episodeId != null ? byEpisode.get(episodeId) : undefined;
  const selectedSonarr = episodeId != null ? sonarrById.get(episodeId) : undefined;
  const selectedFile = selectedSonarr?.episodeFileId
    ? episodeFileMap.get(selectedSonarr.episodeFileId)
    : undefined;
  const code = selected ? formatEpisodeCode(selected.season, selected.episode) : "";

  const actions = useSubtitleActions({
    bazarrId,
    target: selected
      ? { type: "episode", seriesId, episodeId: selected.sonarrEpisodeId }
      : null,
    item: selected ?? null,
    // Episodes carry no profile of their own; the series' applies, also on the
    // coverage card before any episode is opened.
    profileId: bazarrSeries?.profileId ?? null,
    title: selected ? `${series?.title ?? ""} · ${code}` : "",
    videoFps: selectedFile?.mediaInfo?.videoFps,
    profileTarget: seriesId > 0 ? { type: "series", seriesId } : null,
    manualSearchHref:
      selected && bazarrId
        ? `/series/subtitles/${seriesId}?episodeId=${selected.sonarrEpisodeId}&bazarrId=${bazarrId}&title=${encodeURIComponent(code)}`
        : null,
  });

  const openEpisode = (id: number) => {
    if (!byEpisode.has(id)) return;
    setEpisodeId(id);
    actions.flow.open("host");
  };

  // Episodes still missing a language, in airing order, for prev/next.
  const gapOrder = useMemo(
    () =>
      (bazarrEpisodes ?? [])
        .filter((e) => e.missing_subtitles.length > 0)
        .sort((a, b) => a.season - b.season || a.episode - b.episode),
    [bazarrEpisodes],
  );
  const position = (e: BazarrEpisode) => e.season * 10_000 + e.episode;
  const prevGap = selected
    ? [...gapOrder].reverse().find((e) => position(e) < position(selected))
    : undefined;
  const nextGap = selected ? gapOrder.find((e) => position(e) > position(selected)) : undefined;

  // --- Bulk searches ---

  // Any episode target of this series refreshes the same series-wide keys.
  const seriesTarget = { type: "episode" as const, seriesId, episodeId: 0 };
  const searchSeason = useBazarrSubtitleMutation(
    bazarrId,
    async (season: number, id) => {
      const targets = seasonMissingTargets(bazarrEpisodes ?? [], season);
      await searchSubtitles(
        targets.flatMap((t) =>
          t.languages.map((l) => ({
            target: { type: "episode" as const, seriesId, episodeId: t.episode.sonarrEpisodeId },
            lang: { code2: l.code2, forced: l.forced, hi: l.hi },
          })),
        ),
        id,
      );
    },
    () => seriesTarget,
  );
  const searchSeries = useBazarrSubtitleMutation(
    bazarrId,
    (_: void, id) => searchMissingSubtitles({ type: "series", seriesId }, id),
    () => seriesTarget,
  );

  const onSearchSeason = (season: number) => {
    const gaps = gapsBySeason.get(season) ?? 0;
    if (gaps === 0) return;
    searchSeason.mutate(season, {
      onSuccess: () =>
        toast(
          `Searching subtitles for ${gaps} episode${gaps === 1 ? "" : "s"}…`,
          "info",
        ),
      onError: (err) => toastError("Couldn't start the search", err),
    });
  };
  const onSearchSeries = () =>
    searchSeries.mutate(undefined, {
      onSuccess: () => toast(`Searching missing subtitles for ${series?.title ?? "this show"}…`, "info"),
      onError: (err) => toastError("Couldn't start the search", err),
    });

  const linked = !!bazarrId && !!bazarrEpisodes;
  const seriesGaps = gapOrder.length;

  const coverageCard =
    linked && grid && grid.languages.length > 0 ? (
      <SubtitleCoverageCard
        languages={grid.languages}
        seasons={grid.seasons}
        onOpenEpisode={openEpisode}
        onSearchSeason={onSearchSeason}
        profileName={actions.profileName}
        onPressProfile={actions.blockProps.onPressProfile}
      />
    ) : null;

  const modals = linked ? (
    <>
      <EpisodeSubtitlesSheet
        {...actions.flow.bind("host")}
        code={code}
        title={selectedSonarr?.title ?? ""}
        mediaLine={
          selectedFile?.mediaInfo
            ? `${formatResolution(selectedFile.mediaInfo.resolution)} · ${selectedFile.mediaInfo.videoCodec} · ${selectedFile.mediaInfo.audioCodec} ${formatAudioChannels(selectedFile.mediaInfo.audioChannels)}`
            : undefined
        }
        audio={audioFor(selected, selectedSonarr)}
        rows={selected ? buildSubtitleRows(selected) : []}
        blockProps={actions.blockProps}
        prevGap={
          prevGap
            ? {
                label: formatEpisodeCode(prevGap.season, prevGap.episode),
                onPress: () => setEpisodeId(prevGap.sonarrEpisodeId),
              }
            : null
        }
        nextGap={
          nextGap
            ? {
                label: formatEpisodeCode(nextGap.season, nextGap.episode),
                onPress: () => setEpisodeId(nextGap.sonarrEpisodeId),
              }
            : null
        }
      />
      {actions.modals}
    </>
  ) : null;

  return {
    linked,
    bazarrId,
    coverageCard,
    episodeLanguages: linked ? episodeLanguages : undefined,
    gapsBySeason,
    seriesGaps,
    openEpisode,
    onSearchSeason,
    onSearchSeries,
    modals,
  };
}
