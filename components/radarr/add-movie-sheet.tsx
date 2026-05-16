import { useState } from "react";
import { Film } from "lucide-react-native";
import { Select } from "@/components/ui/select";
import { toast, toastError } from "@/components/ui/toast";
import { AddMediaSheet } from "@/components/common/add-media-sheet";
import {
  useAddMovie,
  useRadarrQualityProfiles,
  useRadarrRootFolders,
  useRadarrTags,
} from "@/hooks/use-radarr";
import type {
  RadarrMinimumAvailability,
  RadarrMonitorOption,
} from "@/services/radarr-api";
import type { RadarrSearchResult } from "@/lib/types";

interface AddMovieSheetProps {
  result: RadarrSearchResult | null;
  visible: boolean;
  onClose: () => void;
}

const MIN_AVAILABILITY_OPTIONS: {
  value: RadarrMinimumAvailability;
  label: string;
  description: string;
}[] = [
  { value: "announced", label: "Announced", description: "Monitor as soon as announced" },
  { value: "inCinemas", label: "In Cinemas", description: "Monitor once in theaters" },
  { value: "released", label: "Released", description: "Monitor once officially released" },
];

const MONITOR_OPTIONS: {
  value: RadarrMonitorOption;
  label: string;
  description: string;
}[] = [
  { value: "movieOnly", label: "Movie Only", description: "Monitor just this movie" },
  { value: "movieAndCollection", label: "Movie and Collection", description: "Also monitor the collection" },
  { value: "none", label: "None", description: "Don't monitor" },
];

export function AddMovieSheet({ result, visible, onClose }: AddMovieSheetProps) {
  const { data: profiles } = useRadarrQualityProfiles();
  const { data: folders } = useRadarrRootFolders();
  const { data: tags } = useRadarrTags();
  const addMovie = useAddMovie();

  const [minimumAvailability, setMinimumAvailability] =
    useState<RadarrMinimumAvailability>("released");
  const [monitor, setMonitor] = useState<RadarrMonitorOption>("movieOnly");

  return (
    <AddMediaSheet
      visible={visible}
      onClose={onClose}
      result={result}
      serviceId="radarr"
      sheetTitle="Add Movie"
      submitLabel="Add Movie"
      placeholderIcon={Film}
      profiles={profiles}
      folders={folders}
      tags={tags}
      isSubmitting={addMovie.isPending}
      searchToggleDescription="Trigger an automatic search once the movie is added"
      onSubmit={({ qualityProfileId, rootFolderPath, selectedTags, searchOnAdd }) => {
        if (!result) return;
        addMovie.mutate(
          {
            tmdbId: result.tmdbId,
            title: result.title,
            qualityProfileId,
            rootFolderPath,
            monitored: monitor !== "none",
            searchForMovie: searchOnAdd,
            minimumAvailability,
            monitor,
            tags: selectedTags,
          },
          {
            onSuccess: () => {
              toast(`${result.title} added to Radarr`);
              onClose();
            },
            onError: (err) => toastError("Failed to add movie", err),
          },
        );
      }}
    >
      <Select
        label="Minimum Availability"
        value={minimumAvailability}
        options={MIN_AVAILABILITY_OPTIONS}
        onChange={setMinimumAvailability}
        containerClassName="mb-4"
      />

      <Select
        label="Monitor"
        value={monitor}
        options={MONITOR_OPTIONS}
        onChange={setMonitor}
        containerClassName="mb-4"
      />
    </AddMediaSheet>
  );
}
