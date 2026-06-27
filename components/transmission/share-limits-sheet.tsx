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
import { useSetTransmissionShareLimits } from "@/hooks/use-transmission";
import {
  SEED_MODE_GLOBAL,
  SEED_MODE_SINGLE,
  SEED_MODE_UNLIMITED,
} from "@/services/transmission-api";

cssInterop(KeyboardAwareScrollView, {
  className: "style",
  contentContainerClassName: "contentContainerStyle",
});

type ShareMode = "global" | "unlimited" | "custom";

interface ShareLimitsSheetProps {
  visible: boolean;
  onClose: () => void;
  hash: string;
  // Current per-torrent seed limits. Modes: 0 global, 1 single (custom),
  // 2 unlimited. seedIdleLimit is in minutes.
  ratioMode: number;
  ratioLimit: number;
  idleMode: number;
  idleLimit: number;
}

function deriveMode(ratioMode: number, idleMode: number): ShareMode {
  if (ratioMode === SEED_MODE_GLOBAL && idleMode === SEED_MODE_GLOBAL) return "global";
  if (ratioMode === SEED_MODE_UNLIMITED && idleMode === SEED_MODE_UNLIMITED)
    return "unlimited";
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
  ratioMode,
  ratioLimit,
  idleMode,
  idleLimit,
}: ShareLimitsSheetProps) {
  const setShare = useSetTransmissionShareLimits();

  const [mode, setMode] = useState<ShareMode>("global");
  const [ratio, setRatio] = useState("");
  const [minutes, setMinutes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Seed the form from the torrent's current limits whenever the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setMode(deriveMode(ratioMode, idleMode));
    setRatio(ratioMode === SEED_MODE_SINGLE && ratioLimit >= 0 ? String(ratioLimit) : "");
    setMinutes(idleMode === SEED_MODE_SINGLE && idleLimit >= 0 ? String(idleLimit) : "");
    setError(null);
  }, [visible, ratioMode, ratioLimit, idleMode, idleLimit]);

  const handleSave = async () => {
    let nextRatioMode = SEED_MODE_GLOBAL;
    let nextIdleMode = SEED_MODE_GLOBAL;
    let nextRatioLimit: number | undefined;
    let nextIdleLimit: number | undefined;

    if (mode === "unlimited") {
      nextRatioMode = SEED_MODE_UNLIMITED;
      nextIdleMode = SEED_MODE_UNLIMITED;
    } else if (mode === "custom") {
      const r = parseNonNegative(ratio);
      const m = parseNonNegative(minutes);
      if (Number.isNaN(r) || Number.isNaN(m)) {
        setError("Enter a positive number, or leave blank for no limit.");
        return;
      }
      // Per-dimension: a filled field overrides (mode 1) with its value; a blank
      // field means no limit on that dimension (mode 2).
      if (r === null) {
        nextRatioMode = SEED_MODE_UNLIMITED;
      } else {
        nextRatioMode = SEED_MODE_SINGLE;
        nextRatioLimit = r;
      }
      if (m === null) {
        nextIdleMode = SEED_MODE_UNLIMITED;
      } else {
        nextIdleMode = SEED_MODE_SINGLE;
        nextIdleLimit = Math.round(m);
      }
    }
    setError(null);

    try {
      await setShare.mutateAsync({
        hashes: [hash],
        ratioMode: nextRatioMode,
        ratioLimit: nextRatioLimit,
        idleMode: nextIdleMode,
        idleLimit: nextIdleLimit,
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
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
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
                ? "Uses the global ratio and idle-seeding limits from Transmission's settings."
                : mode === "unlimited"
                  ? "Seeds indefinitely, ignoring the global limits."
                  : "Set a custom ratio and/or idle time. Leave a field blank for no limit on that one."}
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
                  Idle time
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

          {error ? <Text className="text-danger text-sm mb-3">{error}</Text> : null}

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
