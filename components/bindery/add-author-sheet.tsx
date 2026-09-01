import { useState } from "react";
import { Modal, View, Text, ScrollView } from "react-native";
import { Image } from "expo-image";
import { User } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast, toastError } from "@/components/ui/toast";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import {
  useAddBinderyAuthor,
  useBinderyRootFolders,
  useBinderyMetadataProfiles,
  useBinderySetting,
} from "@/hooks/use-bindery";
import { formatBytes } from "@/lib/utils";
import type {
  BinderyAuthorSearchResult,
  BinderyAuthorMonitorMode,
  BinderyMediaType,
} from "@/lib/types";

// Purpose-built rather than reusing components/common/add-media-sheet.tsx.
// That sheet is shaped around three *arr assumptions Bindery breaks: a quality
// profile is required, root folders are addressed by PATH, and tags exist.
// Bindery requires neither profile, addresses root folders by id, has no tag
// concept at all, and adds two fields with no *arr analogue (media type and
// monitor mode). Widening AddMediaSheet for all five would complicate the
// component every *arr uses to serve the one service that fits it worst.

interface AddAuthorSheetProps {
  result: BinderyAuthorSearchResult | null;
  visible: boolean;
  onClose: () => void;
}

// `series` is deliberately absent: it monitors a hand-picked set of the
// author's series, which cannot exist before the author (and their catalogue)
// does. It is an edit-screen mode, not an add-time one.
const MONITOR_OPTIONS: {
  value: BinderyAuthorMonitorMode;
  label: string;
  description: string;
}[] = [
  { value: "all", label: "All Books", description: "Monitor every book" },
  { value: "future", label: "Future Books", description: "Only monitor new releases" },
  { value: "latest", label: "Latest Book", description: "Only the most recent release" },
  { value: "none", label: "None", description: "Add without monitoring" },
];

const MEDIA_TYPE_OPTIONS: {
  value: BinderyMediaType;
  label: string;
  description: string;
}[] = [
  { value: "ebook", label: "Ebook", description: "Collect ebook editions" },
  { value: "audiobook", label: "Audiobook", description: "Collect audiobook editions" },
  { value: "both", label: "Both", description: "Collect ebook and audiobook" },
];

export function AddAuthorSheet({ result, visible, onClose }: AddAuthorSheetProps) {
  const { data: folders } = useBinderyRootFolders();
  const { data: metadataProfiles } = useBinderyMetadataProfiles();
  const addAuthor = useAddBinderyAuthor();
  const footerPadding = useSheetBottomPadding();

  const [rootFolderId, setRootFolderId] = useState<number | undefined>();
  const [metadataProfileId, setMetadataProfileId] = useState<number | undefined>();
  const [mediaType, setMediaType] = useState<BinderyMediaType>("ebook");
  const [monitorMode, setMonitorMode] = useState<BinderyAuthorMonitorMode>("all");
  // Tracks whether the user actually touched the monitor picker. Untouched, we
  // omit monitorMode entirely so the server's own install default applies
  // rather than this sheet's cosmetic "all".
  const [monitorTouched, setMonitorTouched] = useState(false);
  const [searchOnAdd, setSearchOnAdd] = useState(true);

  // Seed from Bindery's own install default, NOT from first-in-list. The two
  // are not interchangeable: posting an explicit rootFolderId outranks the
  // install default in the importer's resolution order, so seeding from
  // folders[0] would quietly make the user's configured default unreachable
  // whenever it is not the first row. Fall back to first-in-list only when the
  // setting is unset or names a folder that no longer exists.
  const { data: defaultRootSetting } = useBinderySetting(
    "library.defaultRootFolderId",
  );
  const settingRootId = defaultRootSetting ? Number(defaultRootSetting) : undefined;
  const defaultRootFolderId =
    settingRootId != null &&
    Number.isFinite(settingRootId) &&
    folders?.some((f) => f.id === settingRootId)
      ? settingRootId
      : folders?.[0]?.id;

  // Root folder is optional server-side (a null one falls back to the install
  // default and then BINDERY_LIBRARY_DIR), and a fresh Bindery genuinely ships
  // with none configured — so an empty list is a note, not a blocker.
  const effectiveRootFolderId = rootFolderId ?? defaultRootFolderId;
  const effectiveMetadataProfileId = metadataProfileId ?? metadataProfiles?.[0]?.id;

  if (!result) return null;

  // Search results are never image-proxied upstream (they aren't in the library
  // yet), so this is a raw provider URL used directly — no useServiceImage, no
  // API key. OpenLibrary stubs usually carry none at all.
  const posterUrl = result.imageUrl?.trim() || null;

  const handleAdd = () => {
    addAuthor.mutate(
      {
        foreignAuthorId: result.foreignAuthorId,
        authorName: result.authorName,
        monitored: monitorMode !== "none",
        searchOnAdd,
        mediaType,
        ...(effectiveRootFolderId != null ? { rootFolderId: effectiveRootFolderId } : {}),
        ...(effectiveMetadataProfileId != null
          ? { metadataProfileId: effectiveMetadataProfileId }
          : {}),
        ...(monitorTouched ? { monitorMode } : {}),
      },
      {
        onSuccess: () => {
          toast(`${result.authorName} added to Bindery`);
          onClose();
        },
        onError: (err) => {
          // A 409 means the author is already in the library. The server sends
          // back the canonical row, so say that rather than "request failed".
          const message = err instanceof Error ? err.message : "";
          if (message.toLowerCase().includes("already exists")) {
            toastError(`${result.authorName} is already in Bindery`, err);
          } else {
            toastError("Failed to add author", err);
          }
        },
      },
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Add Author" onClose={onClose} />

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
              />
            ) : (
              <View className="rounded-lg bg-surface-light items-center justify-center w-[5.7rem] h-[8.6rem]">
                <Icon icon={User} size={24} color="#71717a" />
              </View>
            )}
            <View className="flex-1 justify-center">
              <Text className="text-zinc-100 text-base font-semibold" numberOfLines={2}>
                {result.authorName}
              </Text>
              {result.disambiguation ? (
                <Text className="text-zinc-500 text-sm mt-0.5" numberOfLines={2}>
                  {result.disambiguation}
                </Text>
              ) : null}
              {result.description ? (
                <Text className="text-zinc-500 text-xs mt-1.5" numberOfLines={3}>
                  {result.description}
                </Text>
              ) : null}
            </View>
          </View>

          {folders && folders.length === 0 ? (
            <Text className="text-zinc-500 text-xs mb-4">
              No root folders are configured in Bindery. It will fall back to the
              server&apos;s default library directory.
            </Text>
          ) : (
            <Select
              label="Root Folder"
              value={effectiveRootFolderId}
              options={
                folders?.map((f) => ({
                  value: f.id,
                  label: f.path,
                  description: `${formatBytes(f.freeSpace)} free`,
                })) ?? []
              }
              onChange={setRootFolderId}
              placeholder="Select root folder"
              containerClassName="mb-4"
            />
          )}

          {/* No Quality Profile picker. Bindery's "qualities" are file
              extensions (epub, azw3, m4b) rather than *arr release qualities,
              its seeded profiles carry empty item lists, and it exposes no
              default flag to preselect against — so the field would be a
              control with nothing meaningful to choose. Omitting it leaves
              qualityProfileId null, which is what Bindery's own UI does. */}

          <Select
            label="Metadata Profile"
            value={effectiveMetadataProfileId}
            options={metadataProfiles?.map((p) => ({ value: p.id, label: p.name })) ?? []}
            onChange={setMetadataProfileId}
            placeholder="Select metadata profile"
            containerClassName="mb-4"
          />

          {/* Media type is a one-shot instruction to the catalogue sync, not a
              stored author property — it decides what to collect for books the
              metadata provider gave no format for. */}
          <Select
            label="Collect"
            value={mediaType}
            options={MEDIA_TYPE_OPTIONS}
            onChange={setMediaType}
            containerClassName="mb-4"
          />

          <Select
            label="Monitor"
            value={monitorMode}
            options={MONITOR_OPTIONS}
            onChange={(value: BinderyAuthorMonitorMode) => {
              setMonitorMode(value);
              setMonitorTouched(true);
            }}
            containerClassName="mb-4"
          />

          <Toggle
            label="Start Search on Add"
            description="Search for the author's books once added"
            value={searchOnAdd}
            onValueChange={setSearchOnAdd}
          />
        </ScrollView>

        <View className="px-4 pt-3 border-t border-border" style={footerPadding}>
          <Button
            label="Add Author"
            onPress={handleAdd}
            loading={addAuthor.isPending}
            disabled={addAuthor.isPending}
          />
        </View>
      </View>
    </Modal>
  );
}
