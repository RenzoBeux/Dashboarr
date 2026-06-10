import { useEffect, useState } from "react";
import { Modal, ScrollView, View } from "react-native";
import { Select } from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { SERIES_TYPE_OPTIONS } from "@/components/sonarr/add-series-sheet";
import { useUpdateSeriesFields } from "@/hooks/use-sonarr";
import type { SonarrSeries, SonarrSeriesType } from "@/lib/types";

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

// Editable Sonarr series options (issue #184). A dedicated sheet with
// full-size Select/Toggle controls instead of small tappable rows; Save sends
// all changed fields in a single PUT.
export function SeriesOptionsSheet({
  visible,
  onClose,
  series,
  instanceId,
}: SeriesOptionsSheetProps) {
  const updateFields = useUpdateSeriesFields(instanceId);

  const [seriesType, setSeriesType] = useState<SonarrSeriesType>(
    series.seriesType,
  );
  const [seasonFolder, setSeasonFolder] = useState(series.seasonFolder);
  const [monitorNewItems, setMonitorNewItems] = useState(
    series.monitorNewItems,
  );

  // Re-seed from the server values whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setSeriesType(series.seriesType);
    setSeasonFolder(series.seasonFolder);
    setMonitorNewItems(series.monitorNewItems);
  }, [visible, series]);

  const fields: Partial<SonarrSeries> = {};
  if (seriesType !== series.seriesType) fields.seriesType = seriesType;
  if (seasonFolder !== series.seasonFolder) fields.seasonFolder = seasonFolder;
  if (monitorNewItems != null && monitorNewItems !== series.monitorNewItems) {
    fields.monitorNewItems = monitorNewItems;
  }
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

        <ScrollView contentContainerClassName="px-4 py-4 pb-8">
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

          <Button label="Save" onPress={handleSave} disabled={!dirty} />
        </ScrollView>
      </View>
    </Modal>
  );
}
