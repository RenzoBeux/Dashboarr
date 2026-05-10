import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  StyleSheet,
} from "react-native";
import { X, AlertTriangle, Download, ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassSurface } from "@/components/ui/glass-surface";
import { Button } from "@/components/ui/button";
import { ICON } from "@/lib/constants";
import { formatBytes, formatReleaseAge } from "@/lib/utils";
import { getQualityColor } from "@/lib/quality-colors";
import { useGrabRadarrRelease } from "@/hooks/use-radarr";
import { useGrabSonarrRelease } from "@/hooks/use-sonarr";
import type { ArrRelease, SonarrRelease } from "@/lib/types";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX = Math.round(SCREEN_H * 0.85);
const OFFSCREEN = SHEET_MAX + 140;

interface ReleaseDetailSheetProps {
  release: ArrRelease | SonarrRelease | null;
  service: "radarr" | "sonarr";
  instanceId?: string;
  onClose: () => void;
  onGrabbed?: () => void;
}

export function ReleaseDetailSheet({
  release,
  service,
  instanceId,
  onClose,
  onGrabbed,
}: ReleaseDetailSheetProps) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(false);
  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);

  // Both grab hooks coexist so the sheet can be used from either service.
  // Only one will fire per render.
  const radarrGrab = useGrabRadarrRelease(instanceId);
  const sonarrGrab = useGrabSonarrRelease(instanceId);
  const grab = service === "radarr" ? radarrGrab : sonarrGrab;

  const visible = release !== null;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withSpring(0, {
        damping: 24,
        stiffness: 210,
        mass: 0.9,
      });
      backdrop.value = withTiming(1, { duration: 180 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const handlePan = Gesture.Pan()
    .onUpdate((e) => {
      translateY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 90 || e.velocityY > 800) {
        runOnJS(onClose)();
      } else {
        translateY.value = withSpring(0, { damping: 24, stiffness: 210 });
      }
    });

  function handleGrab() {
    if (!release) return;
    grab.mutate(
      { guid: release.guid, indexerId: release.indexerId },
      {
        onSuccess: () => {
          onClose();
          onGrabbed?.();
        },
      },
    );
  }

  if (!release) {
    return (
      <Modal visible={mounted} transparent animationType="none" statusBarTranslucent>
        <View />
      </Modal>
    );
  }

  const isTorrent = release.protocol === "torrent";
  const qualityName = release.quality?.quality?.name ?? "Unknown";
  const qualityColor = getQualityColor(qualityName);
  const isProper = (release.quality?.revision?.version ?? 1) > 1;
  const isRepack = release.quality?.revision?.isRepack === true;
  const sonarr = release as SonarrRelease;
  const isSeasonPack = sonarr.fullSeason === true;
  const ageLabel = formatReleaseAge(
    release.age,
    release.ageHours,
    release.ageMinutes,
  );

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable onPress={onClose} className="flex-1 bg-black/70" />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyle,
              {
                maxHeight: SHEET_MAX,
                paddingBottom: insets.bottom + 8,
                overflow: "hidden",
              },
            ]}
            className="rounded-t-3xl border-t border-border"
          >
            <GlassSurface
              style={StyleSheet.absoluteFill}
              fallbackClassName="bg-surface"
            />

            <GestureDetector gesture={handlePan}>
              <View>
                <View className="items-center pt-3 pb-1">
                  <View className="w-10 h-1 rounded-full bg-zinc-700" />
                </View>
                <View className="flex-row items-start justify-between px-5 pt-3 pb-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-zinc-100 text-base font-bold leading-5">
                      Release details
                    </Text>
                    <Text className="text-zinc-500 text-xs mt-0.5">
                      {release.indexer} · {isTorrent ? "Torrent" : "Usenet"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                  >
                    <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
                  </Pressable>
                </View>
                <View className="h-px bg-border/60 mx-5" />
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="px-5 pt-4 pb-2"
              showsVerticalScrollIndicator={false}
            >
              {/* Title */}
              <Text
                selectable
                className="text-zinc-100 text-sm leading-5 mb-3"
              >
                {release.title}
              </Text>

              {/* Quality + flags row */}
              <View className="flex-row items-center flex-wrap gap-1.5 mb-4">
                <View
                  className="rounded-md px-2 py-1"
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
                  <View className="rounded-md px-2 py-1" style={{ backgroundColor: "#b45309" }}>
                    <Text className="text-xs font-semibold" style={{ color: "#fffbeb" }}>
                      PROPER
                    </Text>
                  </View>
                )}
                {isRepack && (
                  <View className="rounded-md px-2 py-1" style={{ backgroundColor: "#b45309" }}>
                    <Text className="text-xs font-semibold" style={{ color: "#fffbeb" }}>
                      REPACK
                    </Text>
                  </View>
                )}
                {isSeasonPack && (
                  <View className="rounded-md px-2 py-1" style={{ backgroundColor: "#5b21b6" }}>
                    <Text className="text-xs font-semibold" style={{ color: "#f5f3ff" }}>
                      Season Pack
                    </Text>
                  </View>
                )}
                {(release.languages ?? []).slice(0, 3).map((lang) => (
                  <View
                    key={lang.id}
                    className="rounded-md px-2 py-1 bg-surface-light"
                  >
                    <Text className="text-xs font-medium text-zinc-100">
                      {lang.name}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Stats grid */}
              <View className="bg-surface-light/60 rounded-xl p-3 mb-3">
                <View className="flex-row flex-wrap">
                  <Stat label="Size" value={formatBytes(release.size)} />
                  <Stat label="Age" value={ageLabel} />
                  {isTorrent && (
                    <>
                      <Stat
                        label="Seeders"
                        value={String(release.seeders ?? 0)}
                        accent={
                          (release.seeders ?? 0) === 0
                            ? "danger"
                            : (release.seeders ?? 0) >= 25
                              ? "success"
                              : undefined
                        }
                      />
                      <Stat
                        label="Leechers"
                        value={String(release.leechers ?? 0)}
                      />
                    </>
                  )}
                  {release.customFormatScore !== undefined &&
                    release.customFormatScore !== 0 && (
                      <Stat
                        label="Format score"
                        value={
                          release.customFormatScore > 0
                            ? `+${release.customFormatScore}`
                            : String(release.customFormatScore)
                        }
                        accent={
                          release.customFormatScore < 0 ? "danger" : "success"
                        }
                      />
                    )}
                  {release.releaseGroup && (
                    <Stat label="Group" value={release.releaseGroup} />
                  )}
                </View>
              </View>

              {/* Rejection banner */}
              {release.rejected &&
                release.rejections &&
                release.rejections.length > 0 && (
                  <View className="bg-red-950/60 border border-red-900 rounded-xl p-3 mb-3">
                    <View className="flex-row items-center gap-2 mb-2">
                      <Icon icon={AlertTriangle} size={14} color="#fca5a5" />
                      <Text className="text-red-200 text-xs font-semibold uppercase tracking-wide">
                        Rejected by {service === "radarr" ? "Radarr" : "Sonarr"}
                      </Text>
                    </View>
                    {release.rejections.map((r, i) => (
                      <Text
                        key={i}
                        className="text-red-100 text-xs leading-5"
                      >
                        • {r}
                      </Text>
                    ))}
                  </View>
                )}

              {release.infoUrl && (
                <View className="flex-row items-center gap-1 mb-3">
                  <Icon icon={ExternalLink} size={12} color="#71717a" />
                  <Text
                    className="text-zinc-500 text-xs flex-1"
                    numberOfLines={1}
                  >
                    {release.infoUrl}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View className="px-5 pt-2 pb-1">
              <Button
                label={
                  grab.isPending
                    ? "Sending…"
                    : release.rejected
                      ? "Grab anyway"
                      : "Grab"
                }
                onPress={handleGrab}
                variant={release.rejected ? "danger" : "primary"}
                size="lg"
                loading={grab.isPending}
                icon={
                  grab.isPending ? undefined : (
                    <Icon icon={Download} size={16} color="white" />
                  )
                }
              />
            </View>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "success" | "danger";
}) {
  const valueClass =
    accent === "success"
      ? "text-emerald-400"
      : accent === "danger"
        ? "text-red-400"
        : "text-zinc-100";
  return (
    <View className="w-1/2 mb-2">
      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wide">
        {label}
      </Text>
      <Text className={`${valueClass} text-sm font-medium mt-0.5`} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}
