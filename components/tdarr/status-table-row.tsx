import { Pressable, Text, View } from "react-native";
import { CheckCircle2, Circle } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { fileBaseName } from "@/lib/tdarr-format";
import { rowSizeLine, rowTimestamp } from "@/lib/tdarr-tables";
import { formatTimeAgo } from "@/lib/utils";
import type { TdarrStatusTableId, TdarrStatusTableRow } from "@/lib/types";

export function StatusTableRow({
  row, table, onPress, onLongPress, selected = false, selecting = false,
}: {
  row: TdarrStatusTableRow;
  table: TdarrStatusTableId;
  onPress: () => void;
  onLongPress?: () => void;
  /** Ticked in multi-select mode. */
  selected?: boolean;
  /** Multi-select mode is on, so every row shows its check circle. */
  selecting?: boolean;
}) {
  const name = row.fileNameWithoutExtension || fileBaseName(row.file) || row._id;
  const ts = rowTimestamp(row, table);
  const meta = [
    row.video_codec_name || null,
    row.video_resolution || null,
    rowSizeLine(row, table),
    ts ? formatTimeAgo(new Date(ts).toISOString()) : null,
  ].filter(Boolean).join(" · ");
  const status = table === "table3" || table === "table6"
    ? (table === "table3" ? row.TranscodeDecisionMaker : row.HealthCheck)
    : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className={`bg-surface-light rounded-lg px-3 py-2 active:opacity-70 ${selected ? "border border-primary" : ""}`}
    >
      <View className="flex-row items-center gap-2">
        {selecting && (
          <Icon
            icon={selected ? CheckCircle2 : Circle}
            size={16}
            color={selected ? "#3b82f6" : "#71717a"}
          />
        )}
        <Text className="text-zinc-200 text-xs font-medium flex-1" numberOfLines={1}>{name}</Text>
        {row.bumped && (
          <View className="bg-blue-500/15 rounded-md px-1.5 py-0.5">
            <Text className="text-blue-400 text-xs">Bumped</Text>
          </View>
        )}
      </View>
      <Text className="text-zinc-500 text-xs" numberOfLines={1}>{meta}</Text>
      {status ? <Text className="text-red-400 text-xs" numberOfLines={1}>{status}</Text> : null}
    </Pressable>
  );
}
