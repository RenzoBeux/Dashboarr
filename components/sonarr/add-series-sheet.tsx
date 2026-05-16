import { useState } from "react";
import { Tv } from "lucide-react-native";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { toast, toastError } from "@/components/ui/toast";
import { AddMediaSheet } from "@/components/common/add-media-sheet";
import {
  useAddSeries,
  useSonarrQualityProfiles,
  useSonarrRootFolders,
  useSonarrTags,
} from "@/hooks/use-sonarr";
import type {
  SonarrMonitorOption,
  SonarrSeriesType,
} from "@/services/sonarr-api";
import type { SonarrSearchResult } from "@/lib/types";

interface AddSeriesSheetProps {
  result: SonarrSearchResult | null;
  visible: boolean;
  onClose: () => void;
}

const MONITOR_OPTIONS: {
  value: SonarrMonitorOption;
  label: string;
  description: string;
}[] = [
  { value: "all", label: "All Episodes", description: "Monitor every episode" },
  { value: "future", label: "Future Episodes", description: "Only episodes that haven't aired" },
  { value: "missing", label: "Missing Episodes", description: "Episodes without files" },
  { value: "existing", label: "Existing Episodes", description: "Episodes already on disk" },
  { value: "recent", label: "Recent Episodes", description: "Aired in the last 14 days" },
  { value: "pilot", label: "Pilot", description: "Only the pilot episode" },
  { value: "firstSeason", label: "First Season", description: "Only the first season" },
  { value: "lastSeason", label: "Last Season", description: "Only the last season" },
  { value: "none", label: "None", description: "Don't monitor any episodes" },
];

const SERIES_TYPE_OPTIONS: {
  value: SonarrSeriesType;
  label: string;
  description: string;
}[] = [
  { value: "standard", label: "Standard", description: "Episodes released in seasons" },
  { value: "daily", label: "Daily", description: "Episodes released daily (e.g. talk shows)" },
  { value: "anime", label: "Anime", description: "Uses absolute episode numbering" },
];

export function AddSeriesSheet({ result, visible, onClose }: AddSeriesSheetProps) {
  const { data: profiles } = useSonarrQualityProfiles();
  const { data: folders } = useSonarrRootFolders();
  const { data: tags } = useSonarrTags();
  const addSeries = useAddSeries();

  const [monitor, setMonitor] = useState<SonarrMonitorOption>("all");
  const [seriesType, setSeriesType] = useState<SonarrSeriesType>("standard");
  const [seasonFolder, setSeasonFolder] = useState(true);

  const metaLine = result
    ? `${result.year}${result.network ? ` · ${result.network}` : ""}`
    : undefined;

  return (
    <AddMediaSheet
      visible={visible}
      onClose={onClose}
      result={result}
      serviceId="sonarr"
      sheetTitle="Add Series"
      submitLabel="Add Series"
      metaLine={metaLine}
      placeholderIcon={Tv}
      profiles={profiles}
      folders={folders}
      tags={tags}
      isSubmitting={addSeries.isPending}
      searchToggleDescription="Trigger an automatic search once the series is added"
      onSubmit={({ qualityProfileId, rootFolderPath, selectedTags, searchOnAdd }) => {
        if (!result) return;
        addSeries.mutate(
          {
            tvdbId: result.tvdbId,
            title: result.title,
            qualityProfileId,
            rootFolderPath,
            monitored: monitor !== "none",
            seasonFolder,
            searchForMissingEpisodes: searchOnAdd,
            seriesType,
            monitor,
            tags: selectedTags,
          },
          {
            onSuccess: () => {
              toast(`${result.title} added to Sonarr`);
              onClose();
            },
            onError: (err) => toastError("Failed to add series", err),
          },
        );
      }}
    >
      <Select
        label="Monitor"
        value={monitor}
        options={MONITOR_OPTIONS}
        onChange={setMonitor}
        containerClassName="mb-4"
      />

      <Select
        label="Series Type"
        value={seriesType}
        options={SERIES_TYPE_OPTIONS}
        onChange={setSeriesType}
        containerClassName="mb-2"
      />

      <Toggle
        label="Season Folder"
        description="Organize episodes into season subfolders"
        value={seasonFolder}
        onValueChange={setSeasonFolder}
      />
    </AddMediaSheet>
  );
}
