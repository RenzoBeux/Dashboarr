import { View, Text } from "react-native";

export type BadgeVariant = "default" | "downloading" | "grabbing" | "held" | "seeding" | "paused" | "missing" | "wanted" | "warning" | "error" | "success" | "info";

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  default: "bg-zinc-700",
  // Purple = "this is being downloaded right now", everywhere in the app
  // (issue #249). `downloading` is the download client's own state (qBittorrent,
  // SABnzbd, ...) and `grabbing` is an *arr item sitting in the download queue —
  // two vocabularies for the same idea, so they deliberately share one color,
  // the purple Sonarr/Radarr use for their queue (and the poster grid's bar).
  // A blue chip that just means "torrent protocol" wants `info`, not this.
  downloading: "bg-purple-600",
  grabbing: "bg-purple-600",
  // An *arr item the *arr is still holding (delay profile / client unavailable,
  // issue #484): the same purple, dashed and hollow, like the dashed bars. The
  // dashed outline is an overlay (see Badge) so the pill keeps every other
  // variant's box instead of growing by the border width.
  held: "bg-purple-500/20",
  seeding: "bg-green-600",
  paused: "bg-yellow-600",
  warning: "bg-yellow-600",
  missing: "bg-red-600",
  wanted: "bg-orange-600",
  error: "bg-red-600",
  success: "bg-green-600",
  info: "bg-blue-600",
};

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  count?: number;
  className?: string;
}

export function Badge({ label, variant = "default", count, className = "" }: BadgeProps) {
  // The neutral fill is a themed zinc (light gray under the Light theme), so
  // its label is too; the colored fills stay saturated and keep white text.
  // The hollow `held` pill takes a pale purple that the Light theme mirrors.
  const textClass =
    variant === "default"
      ? "text-zinc-50"
      : variant === "held"
        ? "text-purple-300"
        : "text-white";
  return (
    <View className={`flex-row items-center rounded-full px-2.5 py-0.5 ${VARIANT_CLASSES[variant]} ${className}`}>
      {variant === "held" ? (
        <View
          pointerEvents="none"
          className="absolute inset-0 rounded-full border border-dashed border-purple-400"
        />
      ) : null}
      <Text className={`${textClass} text-xs font-medium`}>{label}</Text>
      {count !== undefined && (
        <View className="bg-white/20 rounded-full ml-1.5 px-1.5 min-w-[1.25rem] items-center">
          <Text className={`${textClass} text-xs font-bold`}>{count}</Text>
        </View>
      )}
    </View>
  );
}
