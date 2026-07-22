import { useEffect, useState } from "react";
import { Modal, Platform, Text, View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Select } from "@/components/ui/select";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { MIN_AVAILABILITY_OPTIONS } from "@/components/radarr/add-movie-sheet";
import { useUpdateMovieFields } from "@/hooks/use-radarr";
import type { RadarrMinimumAvailability } from "@/services/radarr-api";
import type { RadarrMovie } from "@/lib/types";

// The sheet holds a TextInput, so it uses the pageSheet keyboard pattern
// (KeyboardAwareScrollView) — see CLAUDE.md and components/qbittorrent/speed-limits-sheet.tsx.
cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface MovieOptionsSheetProps {
  visible: boolean;
  onClose: () => void;
  movie: RadarrMovie;
  instanceId?: string;
}

const DEFAULT_MIN_AVAILABILITY: RadarrMinimumAvailability = "released";

// Editable Radarr movie options to match Radarr's Edit dialog (issue #216):
// minimum availability + the movie's full folder path. A dedicated pageSheet
// with full-size controls; Save sends all changed fields in a single PUT. The
// "Move files on disk" toggle is the explicit, defaulted-off opt-in for the
// destructive move — a separate confirm modal is intentionally avoided because
// this plain pageSheet Modal must never chain into another modal on iOS
// (CLAUDE.md modal-sequencing rules / #83 frozen-app hang).
export function MovieOptionsSheet({
  visible,
  onClose,
  movie,
  instanceId,
}: MovieOptionsSheetProps) {
  const updateFields = useUpdateMovieFields(instanceId);

  const [minimumAvailability, setMinimumAvailability] =
    useState<RadarrMinimumAvailability>(
      (movie.minimumAvailability as RadarrMinimumAvailability) ??
        DEFAULT_MIN_AVAILABILITY,
    );
  const [path, setPath] = useState(movie.path ?? "");
  const [moveFiles, setMoveFiles] = useState(false);
  const scrollPadding = useSheetBottomPadding(32);

  // Re-seed from the server values whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setMinimumAvailability(
      (movie.minimumAvailability as RadarrMinimumAvailability) ??
        DEFAULT_MIN_AVAILABILITY,
    );
    setPath(movie.path ?? "");
    setMoveFiles(false);
  }, [visible, movie]);

  const trimmedPath = path.trim();
  const pathChanged = movie.path != null && trimmedPath !== movie.path;

  const fields: Partial<RadarrMovie> = {};
  if (minimumAvailability !== movie.minimumAvailability) {
    fields.minimumAvailability = minimumAvailability;
  }
  if (pathChanged && trimmedPath.length > 0) {
    fields.path = trimmedPath;
  }
  const dirty = Object.keys(fields).length > 0;

  const handleSave = () => {
    if (!dirty) return;
    // Optimistic update keeps the Options card in sync immediately; on error the
    // hook rolls the caches back and shows a toast.
    updateFields.mutate({
      movieId: movie.id,
      fields,
      moveFiles: fields.path != null && moveFiles,
      errorLabel: "Failed to update movie options",
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
        <SheetHeader title="Movie Options" onClose={onClose} />

        <KeyboardAwareScrollView
          className="flex-1"
          contentContainerClassName="px-4 py-4 pb-8"
          contentContainerStyle={scrollPadding}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
        >
          <Select
            label="Minimum Availability"
            value={minimumAvailability}
            options={MIN_AVAILABILITY_OPTIONS}
            onChange={setMinimumAvailability}
            containerClassName="mb-4"
          />

          {movie.path != null ? (
            <>
              <TextInput
                label="Path"
                value={path}
                onChangeText={setPath}
                placeholder="/movies/Movie Title (Year)"
                autoCapitalize="none"
                autoCorrect={false}
                containerClassName="mb-2"
              />

              {pathChanged ? (
                <Toggle
                  label="Move files on disk"
                  description="Move the existing files to the new folder. Leave off to only update the path in Radarr."
                  value={moveFiles}
                  onValueChange={setMoveFiles}
                />
              ) : null}

              {pathChanged && !moveFiles ? (
                <Text className="text-yellow-500 text-xs mt-1">
                  Files on disk will stay in place; only the path recorded in
                  Radarr changes.
                </Text>
              ) : null}
            </>
          ) : null}

          <Button
            label="Save"
            onPress={handleSave}
            disabled={!dirty}
            className="mt-6"
          />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
