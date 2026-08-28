import { View, Text } from "react-native";
import { Image } from "expo-image";
import { Disc, Pause, Play } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ProgressBar } from "@/components/ui/progress-bar";
import { useUiScale } from "@/hooks/use-ui-scale";
import { navidromeNowPlayingToStream } from "@/lib/now-playing-stream";
import type { NavidromeNowPlayingEntry } from "@/lib/types";

// Album art is square, so this row exists instead of MediaBackdropRow (a 2:3
// poster beside a required 16:9 backdrop) — a music server has neither shape.
// The 44x44 art matches MediaBackdropRow's poster WIDTH so the two line up when
// they appear on the same screen.
const ART_SIZE = 44;

/**
 * One live Navidrome stream. Built from the shared NowPlayingStream projection
 * so the progress/state/title rules stay identical to the Combined Now Playing
 * widget, and only the layout differs.
 */
export function NavidromeNowPlayingRow({
  entry,
  instanceId,
}: {
  entry: NavidromeNowPlayingEntry;
  instanceId: string;
}) {
  const scale = useUiScale();
  const art = Math.round(ART_SIZE * scale);
  const stream = navidromeNowPlayingToStream(entry, instanceId);
  const StateIcon = stream.state === "paused" ? Pause : Play;
  const meta = [entry.artist, entry.album].filter(Boolean).join(" · ");
  const who = [entry.username, entry.playerName].filter(Boolean).join(" · ");

  return (
    <View className="flex-row items-center gap-3">
      <View
        className="rounded-lg overflow-hidden bg-surface-light items-center justify-center"
        style={{ width: art, height: art }}
      >
        {stream.poster ? (
          <Image
            source={stream.poster}
            style={{ width: "100%", height: "100%" }}
            contentFit="cover"
            transition={150}
          />
        ) : (
          <Icon icon={Disc} size={20} color="#52525b" />
        )}
      </View>

      <View className="flex-1 gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon icon={StateIcon} size={12} color="#22c55e" />
          <Text className="text-zinc-100 text-sm font-semibold flex-1" numberOfLines={1}>
            {entry.title}
          </Text>
        </View>
        {!!meta && (
          <Text className="text-zinc-400 text-xs" numberOfLines={1}>
            {meta}
          </Text>
        )}
        <ProgressBar progress={stream.progress} color="bg-success" />
        {!!who && (
          <Text className="text-zinc-600 text-xs" numberOfLines={1}>
            {who}
          </Text>
        )}
      </View>
    </View>
  );
}
