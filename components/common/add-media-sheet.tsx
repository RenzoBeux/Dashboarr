import { useState, type ReactNode } from "react";
import { Modal, View, Text, ScrollView } from "react-native";
import { Image } from "expo-image";
import { Plus, type LucideIcon } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { FilterChip } from "@/components/ui/filter-chip";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useServiceImage } from "@/hooks/use-service-image";
import { formatBytes } from "@/lib/utils";

export interface AddMediaSheetCommonState {
  qualityProfileId: number;
  rootFolderPath: string;
  selectedTags: number[];
  searchOnAdd: boolean;
}

interface MediaImage {
  coverType: string;
  url: string;
  remoteUrl: string;
}

interface QualityProfile {
  id: number;
  name: string;
}

interface RootFolder {
  path: string;
  freeSpace: number;
}

interface MediaTag {
  id: number;
  label: string;
}

interface AddMediaSheetProps {
  visible: boolean;
  onClose: () => void;
  result: {
    title: string;
    year?: number;
    overview?: string;
    images: MediaImage[];
  } | null;
  serviceId: "radarr" | "sonarr";
  sheetTitle: string;
  submitLabel: string;
  metaLine?: string;
  placeholderIcon: LucideIcon;
  profiles: QualityProfile[] | undefined;
  folders: RootFolder[] | undefined;
  tags: MediaTag[] | undefined;
  isSubmitting: boolean;
  onSubmit: (state: AddMediaSheetCommonState) => void;
  /** Service-specific Select/Toggle fields rendered between Quality Profile and Tags. */
  children?: ReactNode;
  /** Optional toggle rendered after Quality Profile, before `children` (e.g. Sonarr's Season Folder). */
  searchToggleDescription: string;
}

export function AddMediaSheet({
  visible,
  onClose,
  result,
  serviceId,
  sheetTitle,
  submitLabel,
  metaLine,
  placeholderIcon,
  profiles,
  folders,
  tags,
  isSubmitting,
  onSubmit,
  children,
  searchToggleDescription,
}: AddMediaSheetProps) {
  const [qualityProfileId, setQualityProfileId] = useState<number | undefined>();
  const [rootFolderPath, setRootFolderPath] = useState<string | undefined>();
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [searchOnAdd, setSearchOnAdd] = useState(true);

  const effectiveQualityProfileId = qualityProfileId ?? profiles?.[0]?.id;
  const effectiveRootFolderPath = rootFolderPath ?? folders?.[0]?.path;

  const poster = result?.images.find((i) => i.coverType === "poster");
  const { src: posterUrl, onError: onPosterError } = useServiceImage(poster, serviceId);

  const toggleTag = (tagId: number) => {
    setSelectedTags((prev) =>
      prev.includes(tagId) ? prev.filter((t) => t !== tagId) : [...prev, tagId],
    );
  };

  const canSubmit =
    !!effectiveQualityProfileId && !!effectiveRootFolderPath && !!result;

  const handleAdd = () => {
    if (!canSubmit) return;
    onSubmit({
      qualityProfileId: effectiveQualityProfileId!,
      rootFolderPath: effectiveRootFolderPath!,
      selectedTags,
      searchOnAdd,
    });
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
        <SheetHeader title={sheetTitle} onClose={onClose} />

        <ScrollView contentContainerClassName="px-4 py-4 pb-8">
          <View className="flex-row gap-3 mb-5">
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                className="rounded-lg bg-surface-light w-[5.7rem] h-[8.6rem]"
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                recyclingKey={posterUrl}
                onError={onPosterError}
              />
            ) : (
              <View className="rounded-lg bg-surface-light items-center justify-center w-[5.7rem] h-[8.6rem]">
                <Icon icon={placeholderIcon} size={24} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-100 text-base font-semibold" numberOfLines={2}>
                {result.title}
              </Text>
              {metaLine ? (
                <Text className="text-zinc-500 text-sm mt-0.5">{metaLine}</Text>
              ) : result.year ? (
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
            options={profiles?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            onChange={setQualityProfileId}
            placeholder="Select quality profile"
            containerClassName="mb-4"
          />

          {children}

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
            description={searchToggleDescription}
            value={searchOnAdd}
            onValueChange={setSearchOnAdd}
          />

          {selectedFolder ? (
            <Text className="text-zinc-600 text-xs mt-4">
              {formatBytes(selectedFolder.freeSpace)} free on {selectedFolder.path}
            </Text>
          ) : null}
        </ScrollView>

        <View className="px-4 pb-6 pt-3 border-t border-border bg-background">
          <Button
            label={submitLabel}
            onPress={handleAdd}
            disabled={!canSubmit}
            loading={isSubmitting}
            icon={<Icon icon={Plus} size={16} color="#fff" />}
            size="lg"
            className="w-full"
          />
        </View>
      </View>
    </Modal>
  );
}
