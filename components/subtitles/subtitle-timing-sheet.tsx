import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { Minus, Plus } from "lucide-react-native";
import { BottomSheet, SheetTitleRow } from "@/components/ui/bottom-sheet";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { FilterChip } from "@/components/ui/filter-chip";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { lightHaptic } from "@/lib/haptics";
import {
  buildFpsAction,
  buildShiftAction,
  FRAME_RATES,
} from "@/lib/bazarr-subtitle-tools";

type Mode = "shift" | "fps";

const STEPS: readonly { ms: number; label: string }[] = [
  { ms: 100, label: "0.1 s" },
  { ms: 500, label: "0.5 s" },
  { ms: 1000, label: "1 s" },
  { ms: 5000, label: "5 s" },
  { ms: 60_000, label: "1 min" },
];

/**
 * Fix a subtitle's timing: shift every line by any amount (−/+ with a step
 * size), or convert between frame rates when lines drift further off the
 * longer the video runs. Resolves to a Bazarr mod string
 * (`shift_offset(...)` / `change_FPS(...)`); the caller runs it.
 *
 * `videoFps` (from Radarr/Sonarr media info) preselects "plays at".
 */
export function SubtitleTimingSheet({
  visible,
  subtitle,
  videoFps,
  busy = false,
  onApply,
  onClose,
  onClosed,
}: {
  visible: boolean;
  // "German · Film.de.srt"
  subtitle: string;
  videoFps?: number | null;
  busy?: boolean;
  onApply: (mod: string, description: string) => void;
  onClose: () => void;
  onClosed?: () => void;
}) {
  const [mode, setMode] = useState<Mode>("shift");
  const [offsetMs, setOffsetMs] = useState(0);
  const [step, setStep] = useState(500);
  const knownFps = FRAME_RATES.find((r) => videoFps && Math.abs(r - videoFps) < 0.01);
  const [fromFps, setFromFps] = useState<number>(25);
  const [toFps, setToFps] = useState<number>(knownFps ?? 23.976);

  // Start fresh each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setMode("shift");
    setOffsetMs(0);
    setToFps(knownFps ?? 23.976);
    setFromFps(knownFps === 25 ? 23.976 : 25);
    // knownFps derives from videoFps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const canApply = mode === "shift" ? offsetMs !== 0 : fromFps !== toFps;
  const label =
    mode === "shift"
      ? offsetMs === 0
        ? "Shift"
        : `Shift by ${formatOffset(offsetMs)}`
      : `Convert ${fromFps} → ${toFps} fps`;

  const apply = () => {
    if (!canApply) return;
    if (mode === "shift") {
      onApply(buildShiftAction(offsetMs), `Shifted by ${formatOffset(offsetMs)}`);
    } else {
      onApply(buildFpsAction(fromFps, toFps), `Converted from ${fromFps} to ${toFps} fps`);
    }
  };

  const nudge = (dir: 1 | -1) => {
    lightHaptic();
    setOffsetMs((v) => v + dir * step);
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={onClosed}
      header={<SheetTitleRow title="Adjust timing" subtitle={subtitle} onClose={onClose} />}
      footer={
        <Button
          label={label}
          onPress={apply}
          disabled={!canApply || busy}
          loading={busy}
          size="lg"
        />
      }
    >
      <SegmentedControl
        options={[
          { value: "shift", label: "Shift" },
          { value: "fps", label: "Frame rate" },
        ]}
        value={mode}
        onChange={setMode}
        className="mb-4"
      />

      {mode === "shift" ? (
        <View className="gap-4">
          <View className="flex-row items-center gap-3">
            <NudgeButton icon={Minus} label="Earlier" onPress={() => nudge(-1)} />
            <View className="flex-1 items-center">
              <Text
                className={`text-3xl font-bold ${offsetMs === 0 ? "text-zinc-500" : "text-zinc-100"}`}
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {formatOffset(offsetMs)}
              </Text>
              <Text className="text-zinc-500 text-xs mt-0.5 text-center">
                {offsetMs === 0
                  ? "Tap − to show lines earlier, + to show them later"
                  : offsetMs < 0
                    ? "Lines appear earlier"
                    : "Lines appear later"}
              </Text>
            </View>
            <NudgeButton icon={Plus} label="Later" onPress={() => nudge(1)} />
          </View>
          <View>
            <Text className="text-zinc-400 text-xs mb-2 ml-0.5">Step per tap</Text>
            <ChipRow>
              {STEPS.map((s) => (
                <FilterChip
                  key={s.ms}
                  label={s.label}
                  selected={step === s.ms}
                  onPress={() => setStep(s.ms)}
                />
              ))}
            </ChipRow>
          </View>
        </View>
      ) : (
        <View className="gap-4">
          <View>
            <Text className="text-zinc-400 text-xs mb-2 ml-0.5">Subtitle was made for</Text>
            <ChipRow>
              {FRAME_RATES.map((r) => (
                <FilterChip
                  key={r}
                  label={String(r)}
                  selected={fromFps === r}
                  onPress={() => setFromFps(r)}
                />
              ))}
            </ChipRow>
          </View>
          <View>
            <Text className="text-zinc-400 text-xs mb-2 ml-0.5">Video plays at</Text>
            <ChipRow>
              {FRAME_RATES.map((r) => (
                <FilterChip
                  key={r}
                  label={String(r)}
                  selected={toFps === r}
                  onPress={() => setToFps(r)}
                />
              ))}
            </ChipRow>
          </View>
          <Text className="text-zinc-500 text-xs leading-5">
            Use this when lines drift further off the longer the video runs.
            {knownFps ? ` The video plays at ${knownFps} fps, from its media info.` : ""}
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

function ChipRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2"
    >
      {children}
    </ScrollView>
  );
}

function NudgeButton({
  icon,
  label,
  onPress,
}: {
  icon: React.ComponentType<any>;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="w-14 h-14 rounded-2xl bg-surface-light items-center justify-center active:opacity-70"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Icon icon={icon} size={22} color="#f4f4f5" />
    </Pressable>
  );
}

/** "+1.5 s", "−0.250 s", "0.0 s". */
export function formatOffset(ms: number): string {
  const sign = ms > 0 ? "+" : ms < 0 ? "−" : "";
  const abs = Math.abs(ms) / 1000;
  return `${sign}${abs.toFixed(ms % 100 === 0 ? 1 : 3)} s`;
}
