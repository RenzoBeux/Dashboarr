import { useState } from "react";
import { Modal, View, Text, ScrollView, Image } from "react-native";
import { Film, Plus } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast } from "@/components/ui/toast";
import { useServiceImage } from "@/hooks/use-service-image";
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
import { formatBytes } from "@/lib/utils";

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

  const [qualityProfileId, setQualityProfileId] = useState<number | undefined>();
  const [rootFolderPath, setRootFolderPath] = useState<string | undefined>();
  const [minimumAvailability, setMinimumAvailability] =
    useState<RadarrMinimumAvailability>("released");
  const [monitor, setMonitor] = useState<RadarrMonitorOption>("movieOnly");
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [searchOnAdd, setSearchOnAdd] = useState(true);

  const effectiveQualityProfileId = qualityProfileId ?? profiles?.[0]?.id;
  const effectiveRootFolderPath = rootFolderPath ?? folders?.[0]?.path;

  const poster = result?.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, "radarr");

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const canSubmit =
    !!effectiveQualityProfileId && !!effectiveRootFolderPath && !!result;

  const handleAdd = () => {
    if (!canSubmit || !result) return;
    addMovie.mutate(
      {
        tmdbId: result.tmdbId,
        title: result.title,
        qualityProfileId: effectiveQualityProfileId!,
        rootFolderPath: effectiveRootFolderPath!,
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
        onError: () => toast("Failed to add movie", "error"),
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
        <SheetHeader title="Add Movie" onClose={onClose} />

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
                <Film size={24} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-100 text-base font-semibold" numberOfLines={2}>
                {result.title}
              </Text>
              {result.year ? (
                <Text className="text-zinc-500 text-sm mt-0.5">{result.year}</Text>
              ) : null}
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

          {tags && tags.length > 0 ? (
            <View className="mb-4">
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
            description="Trigger an automatic search once the movie is added"
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
            label="Add Movie"
            onPress={handleAdd}
            disabled={!canSubmit}
            loading={addMovie.isPending}
            icon={<Plus size={16} color="#fff" />}
            size="lg"
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
