import { memo } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  Cloud,
  HardDrive,
  Users,
  XCircle,
  CheckCheck,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import type { ArrRelease, SonarrRelease } from "@/lib/types";
import { formatBytes, formatReleaseAge } from "@/lib/utils";
import { getQualityColor } from "@/lib/quality-colors";
import { mediumHaptic } from "@/lib/haptics";

// Only animate-in the rows visible in the first viewport. With 100+ results
// every row spawning a Reanimated entering worklet kills frame budget on
// initial mount, and keeping a per-row useSharedValue for press scale taxes
// the UI thread during scroll. Rely on Pressable's `active:` className for
// tactile feedback instead.
const ANIMATE_FIRST_N = 10;

type Release = ArrRelease | SonarrRelease;

interface ReleaseListItemProps {
  release: Release;
  index: number;
  onSelect: (release: Release) => void;
}

function ReleaseListItemImpl({
  release,
  index,
  onSelect,
}: ReleaseListItemProps) {
  const isTorrent = release.protocol === "torrent";
  const qualityName = release.quality?.quality?.name ?? "Unknown";
  const isProper = (release.quality?.revision?.version ?? 1) > 1;
  const isRepack = release.quality?.revision?.isRepack === true;
  const qualityColor = getQualityColor(qualityName);

  const sonarr = release as SonarrRelease;
  const isSeasonPack = sonarr.fullSeason === true;
  const episodeCount = sonarr.mappedEpisodeNumbers?.length ?? 0;

  const seeders = release.seeders ?? 0;
  const leechers = release.leechers ?? 0;
  const seedHealthClass =
    seeders === 0
      ? "text-red-400"
      : seeders >= 25
        ? "text-emerald-400"
        : seeders >= 5
          ? "text-zinc-300"
          : "text-amber-400";

  const ageLabel = formatReleaseAge(
    release.age,
    release.ageHours,
    release.ageMinutes,
  );

  const body = (
    <Pressable
      onPress={() => {
        mediumHaptic();
        onSelect(release);
      }}
      className={`bg-surface rounded-2xl border border-border p-3 mb-2 active:opacity-70 ${
        release.rejected ? "opacity-60" : ""
      }`}
    >
        <View className="flex-row items-start gap-2">
          <View className="flex-1">
            <Text
              className="text-zinc-100 text-sm font-medium leading-5"
              numberOfLines={2}
            >
              {release.title}
            </Text>
          </View>
          <View className="items-end gap-1">
            {isTorrent ? (
              <Icon icon={HardDrive} size={14} color="#a1a1aa" />
            ) : (
              <Icon icon={Cloud} size={14} color="#a1a1aa" />
            )}
            {release.rejected && <Icon icon={XCircle} size={14} color="#ef4444" />}
          </View>
        </View>

        {/* Meta row 1: badges */}
        <View className="flex-row items-center flex-wrap gap-1.5 mt-2">
          <View
            className="rounded-md px-1.5 py-0.5"
            style={{ backgroundColor: qualityColor.bg }}
          >
            <Text
              className="text-xs font-semibold"
              style={{ color: qualityColor.text }}
            >
              {qualityName}
            </Text>
          </View>
          {isProper && (
            <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: "#b45309" }}>
              <Text className="text-xs font-semibold" style={{ color: "#fffbeb" }}>
                PROPER
              </Text>
            </View>
          )}
          {isRepack && (
            <View className="rounded-md px-1.5 py-0.5" style={{ backgroundColor: "#b45309" }}>
              <Text className="text-xs font-semibold" style={{ color: "#fffbeb" }}>
                REPACK
              </Text>
            </View>
          )}
          {isSeasonPack && (
            <View
              className="rounded-md px-1.5 py-0.5 flex-row items-center gap-1"
              style={{ backgroundColor: "#5b21b6" }}
            >
              <Icon icon={CheckCheck} size={10} color="#ede9fe" />
              <Text className="text-xs font-semibold" style={{ color: "#f5f3ff" }}>
                {episodeCount > 0 ? `Season Pack · ${episodeCount} ep` : "Season Pack"}
              </Text>
            </View>
          )}
          {release.releaseGroup && (
            <Text className="text-xs text-zinc-500" numberOfLines={1}>
              {release.releaseGroup}
            </Text>
          )}
        </View>

        {/* Meta row 2: stats */}
        <View className="flex-row items-center mt-1.5 gap-2">
          <Text className="text-xs text-zinc-400">{formatBytes(release.size)}</Text>
          {isTorrent && (
            <View className="flex-row items-center gap-1">
              <Icon icon={Users} size={11} color="#a1a1aa" />
              <Text className={`text-xs font-medium ${seedHealthClass}`}>
                {seeders}
              </Text>
              <Text className="text-xs text-zinc-600">/ {leechers}</Text>
            </View>
          )}
          <Text className="text-xs text-zinc-500">·</Text>
          <Text className="text-xs text-zinc-500">{ageLabel}</Text>
          <Text className="text-xs text-zinc-500">·</Text>
          <Text
            className="text-xs text-zinc-500 flex-1"
            numberOfLines={1}
          >
            {release.indexer}
          </Text>
        </View>

      {release.rejected && release.rejections && release.rejections.length > 0 && (
        <Text
          className="text-xs text-red-400 mt-1.5 leading-4"
          numberOfLines={1}
        >
          Rejected: {release.rejections[0]}
          {release.rejections.length > 1
            ? ` · +${release.rejections.length - 1} more`
            : ""}
        </Text>
      )}
    </Pressable>
  );

  if (index < ANIMATE_FIRST_N) {
    return (
      <Animated.View entering={FadeInDown.delay(index * 15).duration(220)}>
        {body}
      </Animated.View>
    );
  }
  return body;
}

export const ReleaseListItem = memo(ReleaseListItemImpl, (prev, next) => {
  return (
    prev.release.guid === next.release.guid &&
    prev.release.rejected === next.release.rejected &&
    prev.index === next.index &&
    prev.onSelect === next.onSelect
  );
});
