import { useState } from "react";
import { Mic2 } from "lucide-react-native";
import { Select } from "@/components/ui/select";
import { toast, toastError } from "@/components/ui/toast";
import { AddMediaSheet } from "@/components/common/add-media-sheet";
import { useTargetInstance } from "@/hooks/use-instance-target";
import {
  useAddArtist,
  useLidarrQualityProfiles,
  useLidarrMetadataProfiles,
  useLidarrRootFolders,
  useLidarrTags,
} from "@/hooks/use-lidarr";
import type { LidarrMonitorOption } from "@/services/lidarr-api";
import type { LidarrArtistSearchResult } from "@/lib/types";

interface AddArtistSheetProps {
  result: LidarrArtistSearchResult | null;
  visible: boolean;
  onClose: () => void;
}

const MONITOR_OPTIONS: {
  value: LidarrMonitorOption;
  label: string;
  description: string;
}[] = [
  { value: "all", label: "All Albums", description: "Monitor every album" },
  { value: "future", label: "Future Albums", description: "Only monitor new releases" },
  { value: "missing", label: "Missing Albums", description: "Monitor albums without files" },
  { value: "existing", label: "Existing Albums", description: "Only albums already on disk" },
  { value: "none", label: "None", description: "Don't monitor" },
];

export function AddArtistSheet({ result, visible, onClose }: AddArtistSheetProps) {
  const { data: profiles } = useLidarrQualityProfiles();
  const { data: metadataProfiles } = useLidarrMetadataProfiles();
  const { data: folders } = useLidarrRootFolders();
  const { data: tags } = useLidarrTags();
  const addArtist = useAddArtist();

  const [metadataProfileId, setMetadataProfileId] = useState<number | undefined>();
  const [monitor, setMonitor] = useState<LidarrMonitorOption>("all");

  // Mirror AddMediaSheet's default resolution for Lidarr's extra Metadata
  // Profile picker: the instance's stored default (Settings → Add Defaults),
  // falling back to first-in-list when unset or stale.
  const inst = useTargetInstance("lidarr");
  const storedMetadataProfileId = inst?.defaultMetadataProfileId;
  const defaultMetadataProfileId =
    storedMetadataProfileId != null &&
    metadataProfiles?.some((p) => p.id === storedMetadataProfileId)
      ? storedMetadataProfileId
      : metadataProfiles?.[0]?.id;
  const effectiveMetadataProfileId = metadataProfileId ?? defaultMetadataProfileId;

  return (
    <AddMediaSheet
      visible={visible}
      onClose={onClose}
      result={
        result
          ? {
              title: result.artistName,
              overview: result.overview,
              images: result.images,
            }
          : null
      }
      serviceId="lidarr"
      sheetTitle="Add Artist"
      submitLabel="Add Artist"
      metaLine={
        [result?.artistType, result?.disambiguation].filter(Boolean).join(" · ") ||
        undefined
      }
      placeholderIcon={Mic2}
      profiles={profiles}
      folders={folders}
      tags={tags}
      isSubmitting={addArtist.isPending}
      searchToggleDescription="Trigger a search for the artist's albums once added"
      onSubmit={({ qualityProfileId, rootFolderPath, selectedTags, searchOnAdd }) => {
        if (!result || !effectiveMetadataProfileId) return;
        addArtist.mutate(
          {
            foreignArtistId: result.foreignArtistId,
            artistName: result.artistName,
            qualityProfileId,
            metadataProfileId: effectiveMetadataProfileId,
            rootFolderPath,
            monitored: monitor !== "none",
            searchForMissingAlbums: searchOnAdd,
            monitor,
            tags: selectedTags,
          },
          {
            onSuccess: () => {
              toast(`${result.artistName} added to Lidarr`);
              onClose();
            },
            onError: (err) => toastError("Failed to add artist", err),
          },
        );
      }}
    >
      <Select
        label="Metadata Profile"
        value={effectiveMetadataProfileId}
        options={metadataProfiles?.map((p) => ({ value: p.id, label: p.name })) ?? []}
        onChange={setMetadataProfileId}
        placeholder="Select metadata profile"
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
