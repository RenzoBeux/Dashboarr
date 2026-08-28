import { useEffect, useState } from "react";
import { Modal, View, Text, Platform } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Percent } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { toast, toastError, ToastOverlay } from "@/components/ui/toast";
import { useSetDelugeShareLimits } from "@/hooks/use-deluge";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

interface ShareLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
  hash: string;
  // Server the torrent came from. Threaded from the detail route so a torrent
  // opened from the multi-instance dashboard widget writes its limits to that
  // server rather than the active one.
  instanceId?: string;
  // Current per-torrent seed limits. Unlike Transmission's tri-state modes,
  // Deluge has no "inherit global" sentinel: these three values are copied from
  // the global defaults when the torrent is added and are plain per-torrent
  // values afterwards. So the form is Deluge's own two toggles + a ratio,
  // rather than a Global/Custom/Unlimited picker that Deluge cannot express.
  stopAtRatio: boolean;
  stopRatio: number;
  removeAtRatio: boolean;
}

function parseRatio(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function DelugeShareLimitsSheet({
  visible,
  onClose,
  hash,
  instanceId,
  stopAtRatio,
  stopRatio,
  removeAtRatio,
}: ShareLimitsSheetProps) {
  const setShare = useSetDelugeShareLimits(instanceId);

  const [stop, setStop] = useState(false);
  const [ratio, setRatio] = useState("");
  const [remove, setRemove] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollPadding = useSheetBottomPadding(32);

  // Seed the form from the torrent's current limits whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setStop(stopAtRatio);
    setRatio(stopRatio > 0 ? String(stopRatio) : "");
    setRemove(removeAtRatio);
    setError(null);
  }, [visible, stopAtRatio, stopRatio, removeAtRatio]);

  const handleSave = async () => {
    let nextRatio: number | undefined;
    if (stop) {
      const r = parseRatio(ratio);
      if (r === null) {
        setError("Enter a ratio greater than 0.");
        return;
      }
      nextRatio = r;
    }
    setError(null);

    try {
      await setShare.mutateAsync({
        hashes: [hash],
        stopAtRatio: stop,
        stopRatio: nextRatio,
        // Removing at ratio only means anything while stopping at ratio is on.
        removeAtRatio: stop && remove,
      });
      toast("Share limits saved", "success");
      onClose();
    } catch (err) {
      toastError("Failed to save share limits", err);
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
        <SheetHeader title="Share Limits" onClose={onClose} />

        {/* See the note in components/deluge/speed-limits-sheet.tsx — without
            an in-modal toast host a failed save is invisible behind the sheet
            and the form still shows the value the user typed (#268). */}
        <View className="flex-1">
          <KeyboardAwareScrollView
            contentContainerClassName="px-4 py-4 pb-8"
            contentContainerStyle={scrollPadding}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            bottomOffset={20}
          >
            <Card className="mb-4">
              <Toggle
                label="Stop seeding at ratio"
                description="Pause this torrent once it reaches the ratio below."
                value={stop}
                onValueChange={setStop}
                disabled={setShare.isPending}
              />
            </Card>

            {stop ? (
              <>
                <Card className="mb-4 gap-3">
                  <View className="flex-row items-center gap-2">
                    <Icon icon={Percent} size={16} color="#3b82f6" />
                    <Text className="text-zinc-300 text-sm font-semibold">
                      Ratio limit
                    </Text>
                  </View>
                  <TextInput
                    label="Ratio"
                    placeholder="2.0"
                    value={ratio}
                    onChangeText={setRatio}
                    keyboardType="decimal-pad"
                  />
                </Card>

                <Card className="mb-4">
                  <Toggle
                    label="Remove when it stops"
                    description="Delete the torrent from Deluge instead of just pausing it. Files are kept."
                    value={remove}
                    onValueChange={setRemove}
                    disabled={setShare.isPending}
                  />
                </Card>
              </>
            ) : (
              <Text className="text-zinc-500 text-xs mb-4">
                This torrent seeds indefinitely. Deluge applies per-torrent limits
                only, so turning this off ignores the global ratio setting.
              </Text>
            )}

            {error ? <Text className="text-danger text-sm mb-3">{error}</Text> : null}

            <Button
              label="Save Limits"
              onPress={handleSave}
              loading={setShare.isPending}
            />
          </KeyboardAwareScrollView>

          <ToastOverlay />
        </View>
      </View>
    </Modal>
  );
}
