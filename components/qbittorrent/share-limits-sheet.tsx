import { useEffect, useState } from "react";
import { Modal, View, Text, Platform, ScrollView } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { cssInterop } from "nativewind";
import { Percent, Clock } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { SheetHeader } from "@/components/ui/sheet-header";
import { toast, toastError } from "@/components/ui/toast";
import { useSetShareLimits } from "@/hooks/use-qbittorrent";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

// qBittorrent share-limit sentinels, shared by setShareLimits and the
// /torrents/info response: -2 = use global limit, -1 = no limit.
const GLOBAL = -2;
const UNLIMITED = -1;

type ShareMode = "global" | "unlimited" | "custom";

interface ShareLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
  hash: string;
  // Current per-torrent limits (ratio_limit / seeding_time_limit). The seeding
  // limit is in minutes.
  ratioLimit: number;
  seedingTimeLimit: number;
}

function deriveMode(ratio: number, time: number): ShareMode {
  if (ratio === GLOBAL && time === GLOBAL) return "global";
  if (ratio === UNLIMITED && time === UNLIMITED) return "unlimited";
  return "custom";
}

// "" → null (no limit for this dimension); invalid → NaN; otherwise the number.
function parseNonNegative(input: string): number | null {
  const t = input.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return NaN;
  return n;
}

export function ShareLimitsSheet({
  visible,
  onClose,
  hash,
  ratioLimit,
  seedingTimeLimit,
}: ShareLimitsSheetProps) {
  const setShare = useSetShareLimits();

  const [mode, setMode] = useState<ShareMode>("global");
  const [ratio, setRatio] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed the form from the torrent's current limits whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setMode(deriveMode(ratioLimit, seedingTimeLimit));
    setRatio(ratioLimit >= 0 ? String(ratioLimit) : "");
    setMinutes(seedingTimeLimit >= 0 ? String(seedingTimeLimit) : "");
    setError(null);
  }, [visible, ratioLimit, seedingTimeLimit]);

  const handleSave = async () => {
    let ratioVal = GLOBAL;
    let timeVal = GLOBAL;

    if (mode === "unlimited") {
      ratioVal = UNLIMITED;
      timeVal = UNLIMITED;
    } else if (mode === "custom") {
      const r = parseNonNegative(ratio);
      const m = parseNonNegative(minutes);
      if (Number.isNaN(r) || Number.isNaN(m)) {
        setError("Enter a positive number, or leave blank for no limit.");
        return;
      }
      ratioVal = r === null ? UNLIMITED : r;
      timeVal = m === null ? UNLIMITED : Math.round(m);
    }
    setError(null);

    try {
      await setShare.mutateAsync({
        hashes: [hash],
        ratioLimit: ratioVal,
        seedingTimeLimit: timeVal,
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

        <KeyboardAwareScrollView
          contentContainerClassName="px-4 py-4 pb-8"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={
            Platform.OS === "ios" ? "interactive" : "on-drag"
          }
          bottomOffset={20}
        >
          <Card className="mb-4 gap-3">
            <Text className="text-zinc-300 text-sm font-semibold">
              Stop seeding when
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerClassName="gap-2"
            >
              <FilterChip
                label="Global"
                selected={mode === "global"}
                onPress={() => setMode("global")}
              />
              <FilterChip
                label="Custom"
                selected={mode === "custom"}
                onPress={() => setMode("custom")}
              />
              <FilterChip
                label="No limit"
                selected={mode === "unlimited"}
                onPress={() => setMode("unlimited")}
              />
            </ScrollView>
            <Text className="text-zinc-500 text-xs">
              {mode === "global"
                ? "Uses the global ratio and seeding-time limits from qBittorrent's settings."
                : mode === "unlimited"
                  ? "Seeds indefinitely, ignoring the global limits."
                  : "Set a custom ratio and/or seeding time. Leave a field blank for no limit on that one."}
            </Text>
          </Card>

          {mode === "custom" ? (
            <Card className="mb-4 gap-3">
              <View className="flex-row items-center gap-2">
                <Icon icon={Percent} size={16} color="#3b82f6" />
                <Text className="text-zinc-300 text-sm font-semibold">
                  Ratio limit
                </Text>
              </View>
              <TextInput
                label="Ratio"
                placeholder="No limit"
                value={ratio}
                onChangeText={setRatio}
                keyboardType="decimal-pad"
              />

              <View className="flex-row items-center gap-2 mt-1">
                <Icon icon={Clock} size={16} color="#22c55e" />
                <Text className="text-zinc-300 text-sm font-semibold">
                  Seeding time
                </Text>
              </View>
              <TextInput
                label="Minutes"
                placeholder="No limit"
                value={minutes}
                onChangeText={setMinutes}
                keyboardType="numeric"
              />
            </Card>
          ) : null}

          {error ? (
            <Text className="text-danger text-sm mb-3">{error}</Text>
          ) : null}

          <Button
            label="Save Limits"
            onPress={handleSave}
            loading={setShare.isPending}
          />
        </KeyboardAwareScrollView>
      </View>
    </Modal>
  );
}
