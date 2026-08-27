import { useEffect, useState } from "react";
import { Modal, View, Text, ActivityIndicator, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { ArrowDown, ArrowUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { toast, toastError, ToastOverlay } from "@/components/ui/toast";
import { useDelugeSpeedLimits, useSetDelugeSpeedLimits } from "@/hooks/use-deluge";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface SpeedLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// Deluge stores max_download_speed / max_upload_speed as KiB/s floats, so the
// sheet reads and writes KiB/s directly with no byte conversion.
//
// The sentinel is the part that needs care: ANY NEGATIVE value means unlimited,
// and 0 is a real limit that throttles the transfer to a standstill. So a blank
// field maps to -1 (unlimited), and a typed 0 is passed through as the genuine
// zero the user asked for — it is never silently reinterpreted as "no limit".
const UNLIMITED = -1;

function limitToStr(kib: number): string {
  return kib < 0 ? "" : String(kib);
}

// "" → UNLIMITED; a non-negative number → itself; anything else → null (invalid).
function parseLimit(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return UNLIMITED;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function DelugeSpeedLimitsSheet({ visible, onClose }: SpeedLimitsSheetProps) {
  const limits = useDelugeSpeedLimits();
  const setLimits = useSetDelugeSpeedLimits();

  const [dl, setDl] = useState("");
  const [up, setUp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const scrollPadding = useSheetBottomPadding(32);

  // Seed inputs from the server when the sheet opens (or the config reloads).
  useEffect(() => {
    if (!visible || !limits.data) return;
    setDl(limitToStr(limits.data.maxDownload));
    setUp(limitToStr(limits.data.maxUpload));
    setError(null);
  }, [visible, limits.data]);

  const handleSave = async () => {
    const dlKib = parseLimit(dl);
    const upKib = parseLimit(up);
    if (dlKib === null || upKib === null) {
      setError("Limits must be 0 or a positive number (KiB/s), or blank for none");
      return;
    }
    setError(null);

    try {
      await setLimits.mutateAsync({ maxDownload: dlKib, maxUpload: upKib });
      toast("Speed limits saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save speed limits", err);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Speed Limits" onClose={onClose} />

        {/* The wrapper anchors ToastOverlay just below the header. The root
            ToastContainer sits BEHIND this modal, so a failed save — the one
            path that deliberately leaves the sheet open — would otherwise be
            invisible and read as success (#268). */}
        <View className="flex-1">
          <KeyboardAwareScrollView
            contentContainerClassName="px-4 py-4 pb-8"
            contentContainerStyle={scrollPadding}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            bottomOffset={20}
          >
            {limits.isLoading ? (
              <View className="items-center py-10">
                <ActivityIndicator color="#3b82f6" />
              </View>
            ) : limits.isError ? (
              <Card>
                <Text className="text-zinc-400 text-sm">
                  Couldn&apos;t load current limits.
                </Text>
              </Card>
            ) : (
              <>
                <Card className="mb-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon icon={ArrowDown} size={16} color="#3b82f6" />
                    <Icon icon={ArrowUp} size={16} color="#22c55e" />
                    <Text className="text-zinc-300 text-sm font-semibold">
                      Global limits
                    </Text>
                  </View>
                  <Text className="text-zinc-500 text-xs">
                    Leave blank for no limit. Deluge treats 0 as a real limit that
                    stops transfers, not as unlimited.
                  </Text>
                  <TextInput
                    label="Download (KiB/s)"
                    placeholder="No limit"
                    value={dl}
                    onChangeText={setDl}
                    keyboardType="numeric"
                  />
                  <TextInput
                    label="Upload (KiB/s)"
                    placeholder="No limit"
                    value={up}
                    onChangeText={setUp}
                    keyboardType="numeric"
                  />
                </Card>

                {error && <Text className="text-danger text-sm mb-3">{error}</Text>}

                <Button
                  label="Save Limits"
                  onPress={handleSave}
                  loading={setLimits.isPending}
                />
              </>
            )}
          </KeyboardAwareScrollView>

          <ToastOverlay />
        </View>
      </View>
    </Modal>
  );
}
