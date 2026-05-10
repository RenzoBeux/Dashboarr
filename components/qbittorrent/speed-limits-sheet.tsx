import { useEffect, useState } from "react";
import { Modal, View, Text, ActivityIndicator, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Zap, ArrowDown, ArrowUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast, toastError } from "@/components/ui/toast";
import {
  useSpeedLimitsMode,
  useToggleSpeedLimitsMode,
  useSpeedPreferences,
  useSetGlobalSpeedLimits,
  useSetAltSpeedLimits,
} from "@/hooks/use-qbittorrent";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface SpeedLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
}

// qBittorrent stores all four speed-limit prefs in bytes/s. We expose KB/s in
// the UI and convert at the API boundary. 0 = unlimited (both endpoints accept
// 0 for "no limit").
const BYTES_PER_KB = 1024;

function bytesPerSecToKbStr(bps: number): string {
  if (!bps) return "";
  return String(Math.round(bps / BYTES_PER_KB));
}

function parseKb(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === "") return 0;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

export function SpeedLimitsSheet({ visible, onClose }: SpeedLimitsSheetProps) {
  const altMode = useSpeedLimitsMode();
  const toggleAlt = useToggleSpeedLimitsMode();
  const prefs = useSpeedPreferences();
  const setGlobal = useSetGlobalSpeedLimits();
  const setAlt = useSetAltSpeedLimits();

  const [dl, setDl] = useState("");
  const [up, setUp] = useState("");
  const [altDl, setAltDl] = useState("");
  const [altUp, setAltUp] = useState("");
  const [error, setError] = useState<string | null>(null);

  // When the sheet opens (or prefs reload), seed the inputs from the server.
  useEffect(() => {
    if (!visible || !prefs.data) return;
    setDl(bytesPerSecToKbStr(prefs.data.dl_limit));
    setUp(bytesPerSecToKbStr(prefs.data.up_limit));
    setAltDl(bytesPerSecToKbStr(prefs.data.alt_dl_limit));
    setAltUp(bytesPerSecToKbStr(prefs.data.alt_up_limit));
    setError(null);
  }, [visible, prefs.data]);

  const handleSave = async () => {
    const dlKb = parseKb(dl);
    const upKb = parseKb(up);
    const altDlKb = parseKb(altDl);
    const altUpKb = parseKb(altUp);
    if (
      dlKb === null ||
      upKb === null ||
      altDlKb === null ||
      altUpKb === null
    ) {
      setError("Limits must be 0 or a positive number (KB/s)");
      return;
    }
    setError(null);

    const initial = prefs.data;
    const dlBytes = dlKb * BYTES_PER_KB;
    const upBytes = upKb * BYTES_PER_KB;
    const altDlBytes = altDlKb * BYTES_PER_KB;
    const altUpBytes = altUpKb * BYTES_PER_KB;

    try {
      const globalChanged =
        !initial || dlBytes !== initial.dl_limit || upBytes !== initial.up_limit;
      if (globalChanged) {
        await setGlobal.mutateAsync({ dl: dlBytes, up: upBytes });
      }

      const altChanged =
        !initial ||
        altDlBytes !== initial.alt_dl_limit ||
        altUpBytes !== initial.alt_up_limit;
      if (altChanged) {
        await setAlt.mutateAsync({ dl: altDlBytes, up: altUpBytes });
      }

      toast("Speed limits saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save speed limits", err);
    }
  };

  const isSaving = setGlobal.isPending || setAlt.isPending;
  const isLoading = prefs.isLoading || altMode.isLoading;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title="Speed Limits" onClose={onClose} />

        <KeyboardAwareScrollView
          contentContainerClassName="px-4 py-4 pb-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          bottomOffset={20}
        >
          <Card className="mb-4">
            <Toggle
              label="Alternative speed mode"
              description="Throttle to the alternative limits below."
              value={altMode.data ?? false}
              onValueChange={() => toggleAlt.mutate()}
              disabled={toggleAlt.isPending || altMode.isLoading}
            />
          </Card>

          {isLoading ? (
            <View className="items-center py-10">
              <ActivityIndicator color="#3b82f6" />
            </View>
          ) : prefs.isError ? (
            <Card>
              <Text className="text-zinc-400 text-sm">
                Couldn't load current limits.
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
                  Applied when alternative mode is off. 0 = unlimited.
                </Text>
                <TextInput
                  label="Download (KB/s)"
                  placeholder="0"
                  value={dl}
                  onChangeText={setDl}
                  keyboardType="numeric"
                />
                <TextInput
                  label="Upload (KB/s)"
                  placeholder="0"
                  value={up}
                  onChangeText={setUp}
                  keyboardType="numeric"
                />
              </Card>

              <Card className="mb-4 gap-3">
                <View className="flex-row items-center gap-2">
                  <Icon icon={Zap} size={16} color="#f59e0b" />
                  <Text className="text-zinc-300 text-sm font-semibold">
                    Alternative limits
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs">
                  Used while alternative mode is on. 0 = unlimited.
                </Text>
                <TextInput
                  label="Alt download (KB/s)"
                  placeholder="0"
                  value={altDl}
                  onChangeText={setAltDl}
                  keyboardType="numeric"
                />
                <TextInput
                  label="Alt upload (KB/s)"
                  placeholder="0"
                  value={altUp}
                  onChangeText={setAltUp}
                  keyboardType="numeric"
                />
              </Card>

              {error && (
                <Text className="text-danger text-sm mb-3">{error}</Text>
              )}

              <Button
                label="Save Limits"
                onPress={handleSave}
                loading={isSaving}
              />
            </>
          )}
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
