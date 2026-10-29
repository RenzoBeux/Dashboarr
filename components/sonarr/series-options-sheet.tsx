import { useEffect, useState } from "react";
import { Modal, Platform, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { ArrTagPicker } from "@/components/common/arr-tag-picker";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { SERIES_TYPE_OPTIONS } from "@/components/sonarr/add-series-sheet";
import { useSonarrTags, useUpdateSeriesFields } from "@/hooks/use-sonarr";
import { sameTagIds } from "@/lib/arr-tag-input";
import type { SonarrSeries, SonarrSeriesType } from "@/lib/types";

// The tag picker's "New tag" input lives in this pageSheet, so it uses the
// pageSheet keyboard pattern (KeyboardAwareScrollView), see CLAUDE.md.
cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

const NEW_SEASONS_OPTIONS: {
  value: "all" | "none";
  label: string;
  description: string;
}[] = [
  {
    value: "all",
    label: "All Seasons",
    description: "Monitor new seasons automatically",
  },
  { value: "none", label: "None", description: "Don't monitor new seasons" },
];

interface SeriesOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  series: SonarrSeries;
  instanceId?: string;
}

// Editable Sonarr series options (issue #184) and tags (#485). A dedicated
// sheet with full-size Select/Toggle controls instead of small tappable rows;
// Save sends all changed fields in a single PUT, which replaces the series'
// whole tag set.
export function SeriesOptionsSheet({
  visible,
  onClose,
  series,
  instanceId,
}: SeriesOptionsSheetProps) {
  const updateFields = useUpdateSeriesFields(instanceId);
  const { data: tags } = useSonarrTags(instanceId);

  const [seriesType, setSeriesType] = useState<SonarrSeriesType>(
    series.seriesType,
  );
  const [seasonFolder, setSeasonFolder] = useState(series.seasonFolder);
  const [monitorNewItems, setMonitorNewItems] = useState(
    series.monitorNewItems,
  );
  const [selectedTags, setSelectedTags] = useState<number[]>(series.tags ?? []);
  const scrollPadding = useSheetBottomPadding(32);

  // Re-seed from the server values whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSeriesType(series.seriesType);
    setSeasonFolder(series.seasonFolder);
    setMonitorNewItems(series.monitorNewItems);
    setSelectedTags(series.tags ?? []);
  }, [visible, series]);

  const fields: Partial<SonarrSeries> = {};
  if (seriesType !== series.seriesType) fields.seriesType = seriesType;
  if (seasonFolder !== series.seasonFolder) fields.seasonFolder = seasonFolder;
  if (monitorNewItems != null && monitorNewItems !== series.monitorNewItems) {
    fields.monitorNewItems = monitorNewItems;
  }
  if (!sameTagIds(selectedTags, series.tags)) fields.tags = selectedTags;
  const dirty = Object.keys(fields).length > 0;

  const handleSave = () => {
    if (!dirty) return;
    // Optimistic update keeps the Options card in sync immediately; on error
    // the hook rolls the caches back and shows a toast.
    updateFields.mutate({
      seriesId: series.id,
      fields,
      errorLabel: "Failed to update series options",
    });
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Series Options" onClose={onClose} />

        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerClassName="px-4 py-4 pb-8"
          contentContainerStyle={scrollPadding}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
        >
          {/* "Monitor New Seasons" only exists on Sonarr v4+ — hide otherwise. */}
          {series.monitorNewItems != null ? (
            <Select
              label="Monitor New Seasons"
              value={monitorNewItems}
              options={NEW_SEASONS_OPTIONS}
              onChange={setMonitorNewItems}
              containerClassName="mb-4"
            />
          ) : null}

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
            className="mb-4"
          />

          <ArrTagPicker
            service="sonarr"
            instanceId={instanceId}
            tags={tags}
            selected={selectedTags}
            onChange={setSelectedTags}
            className="mb-6"
          />

          <Button label="Save" onPress={handleSave} disabled={!dirty} />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
