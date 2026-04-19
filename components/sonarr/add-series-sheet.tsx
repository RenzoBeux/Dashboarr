import { useState } from "react";
import { Modal, View, Text, ScrollView, Image } from "react-native";
import { Tv, Plus } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast } from "@/components/ui/toast";
import { useServiceImage } from "@/hooks/use-service-image";
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
import { formatBytes } from "@/lib/utils";

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

  const [qualityProfileId, setQualityProfileId] = useState<number | undefined>();
  const [rootFolderPath, setRootFolderPath] = useState<string | undefined>();
  const [monitor, setMonitor] = useState<SonarrMonitorOption>("all");
  const [seriesType, setSeriesType] = useState<SonarrSeriesType>("standard");
  const [seasonFolder, setSeasonFolder] = useState(true);
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [searchOnAdd, setSearchOnAdd] = useState(true);

  const effectiveQualityProfileId = qualityProfileId ?? profiles?.[0]?.id;
  const effectiveRootFolderPath = rootFolderPath ?? folders?.[0]?.path;

  const poster = result?.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "sonarr");

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const canSubmit =
    !!effectiveQualityProfileId && !!effectiveRootFolderPath && !!result;

  const handleAdd = () => {
    if (!canSubmit || !result) return;
    addSeries.mutate(
      {
        tvdbId: result.tvdbId,
        title: result.title,
        qualityProfileId: effectiveQualityProfileId!,
        rootFolderPath: effectiveRootFolderPath!,
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
        onError: () => toast("Failed to add series", "error"),
      },
    );
  };

  if (!result) return null;

  const selectedFolder = folders?.find((f) => f.path === effectiveRootFolderPath);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Add Series" onClose={onClose} />

        <ScrollView contentContainerClassName="px-4 py-4 pb-8">
          <View className="flex-row gap-3 mb-5">
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                className="rounded-lg bg-surface-light"
                style={{ width: 80, height: 120 }}
                resizeMode="cover"
                onError={onPosterError}
              />
            ) : (
              <View
                className="rounded-lg bg-surface-light items-center justify-center"
                style={{ width: 80, height: 120 }}
              >
                <Tv size={24} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-100 text-base font-semibold" numberOfLines={2}>
                {result.title}
              </Text>
              <Text className="text-zinc-500 text-sm mt-0.5">
                {result.year}
                {result.network ? ` · ${result.network}` : ""}
              </Text>
              {result.overview ? (
                <Text className="text-zinc-500 text-xs mt-1.5" numberOfLines={3}>
                  {result.overview}
                </Text>
              ) : null}
            </View>
          </View>

          <Select
            label="Root Folder"
            value={effectiveRootFolderPath}
            options={
              folders?.map((f) => ({
                value: f.path,
                label: f.path,
                description: `${formatBytes(f.freeSpace)} free`,
              })) ?? []
            }
            onChange={setRootFolderPath}
            placeholder="Select root folder"
            containerClassName="mb-4"
          />

          <Select
            label="Quality Profile"
            value={effectiveQualityProfileId}
            options={
              profiles?.map((p) => ({ value: p.id, label: p.name })) ?? []
            }
            onChange={setQualityProfileId}
            placeholder="Select quality profile"
            containerClassName="mb-4"
          />

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

          {tags && tags.length > 0 ? (
            <View className="my-3">
              <Text className="text-zinc-400 text-sm mb-2">Tags</Text>
              <View className="flex-row flex-wrap gap-2">
                {tags.map((tag) => (
                  <FilterChip
                    key={tag.id}
                    label={tag.label}
                    selected={selectedTags.includes(tag.id)}
                    onPress={() => toggleTag(tag.id)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          <Toggle
            label="Start Search on Add"
            description="Trigger an automatic search once the series is added"
            value={searchOnAdd}
            onValueChange={setSearchOnAdd}
          />

          {selectedFolder ? (
            <Text className="text-zinc-600 text-xs mt-4">
              {formatBytes(selectedFolder.freeSpace)} free on{" "}
              {selectedFolder.path}
            </Text>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-6 pt-3 border-t border-border bg-background">
          <Button
            label="Add Series"
            onPress={handleAdd}
            disabled={!canSubmit}
            loading={addSeries.isPending}
            icon={<Plus size={16} color="#fff" />}
            size="lg"
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
