import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  Dimensions,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import {
  X,
  Star,
  Check,
  Clock,
  Film,
  Tv,
  Plus,
  Play,
  SlidersHorizontal,
  ExternalLink,
  Trash2,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import { getHttpErrorMessage, formatErrorForCopy } from "@/lib/http-client";
import {
  getPosterUrl,
  getBackdropUrl,
  pickTrailer,
} from "@/services/overseerr-api";
import { RequestOptionsSheet } from "@/components/overseerr/request-options-sheet";
import {
  RequestErrorBanner,
  type RequestError,
} from "@/components/overseerr/request-error-banner";
import {
  useOverseerrMediaDetails,
  useOverseerrRadarrServers,
  useOverseerrSonarrServers,
  useRequestMovie,
  useRequestTV,
  useDeleteMedia,
} from "@/hooks/use-overseerr";
import type {
  OverseerrMediaResult,
  OverseerrMovieDetails,
  OverseerrTVDetails,
} from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface MediaDetailModalProps {
  item: OverseerrMediaResult | null;
  visible: boolean;
  onClose: () => void;
}

// Compact availability indicator used when a quality tier can't be requested
// (already available or already requested).
function StatusPill({
  tone,
  icon,
  label,
}: {
  tone: "success" | "warning";
  icon: React.ComponentType<any>;
  label: string;
}) {
  const s =
    tone === "success"
      ? {
          bg: "bg-green-600/10",
          border: "border-green-600/30",
          text: "text-green-500",
          color: "#22c55e",
        }
      : {
          bg: "bg-yellow-600/10",
          border: "border-yellow-600/30",
          text: "text-yellow-500",
          color: "#eab308",
        };
  return (
    <View
      className={`flex-row items-center justify-center gap-2 py-3 rounded-xl border ${s.bg} ${s.border}`}
    >
      <Icon icon={icon} size={18} color={s.color} />
      <Text className={`font-medium ${s.text}`}>{label}</Text>
    </View>
  );
}

export function MediaDetailModal({
  item,
  visible,
  onClose,
}: MediaDetailModalProps) {
  const [optionsVisible, setOptionsVisible] = useState(false);
  const [optionsIs4k, setOptionsIs4k] = useState(false);
  const [quickKind, setQuickKind] = useState<null | "hd" | "4k">(null);
  const [quickError, setQuickError] = useState<RequestError | null>(null);
  const [removeConfirmVisible, setRemoveConfirmVisible] = useState(false);
  // Set when a request succeeded in the options sheet: this modal dismisses
  // itself only once the sheet reports fully gone (its onClosed) — dismissing
  // both stacked pageSheets in the same tick races the child's teardown on
  // iOS (issue #83 class). Android has no such constraint and keeps the
  // original same-tick close.
  const closeAfterOptions = useRef(false);

  const backdropOpacity = useSharedValue(0);
  const posterModalOpacity = useSharedValue(0);
  const backdropFadeStyle = useAnimatedStyle(() => ({ opacity: withTiming(backdropOpacity.value, { duration: 300 }) }));
  const posterFadeStyle = useAnimatedStyle(() => ({ opacity: withTiming(posterModalOpacity.value, { duration: 400 }) }));

  const isTv = item?.mediaType === "tv";

  // Full details give us trailers + per-tier (4K) status. Only fetched while the
  // sheet is open for this title.
  const detailsQuery = useOverseerrMediaDetails(
    item?.id ?? 0,
    isTv ? "tv" : "movie",
    undefined,
    visible,
  );
  const detailsData = detailsQuery.data as
    | OverseerrMovieDetails
    | OverseerrTVDetails
    | undefined;

  const radarrServersQuery = useOverseerrRadarrServers();
  const sonarrServersQuery = useOverseerrSonarrServers();
  const servers =
    (isTv ? sonarrServersQuery.data : radarrServersQuery.data) ?? [];
  const has4kServer = servers.some((s) => s.is4k);

  const requestMovie = useRequestMovie();
  const requestTV = useRequestTV();
  const removeMedia = useDeleteMedia();

  useEffect(() => {
    if (visible) {
      setQuickError(null);
      setQuickKind(null);
    }
  }, [visible, item?.id]);

  useEffect(() => {
    if (!visible) {
      setOptionsVisible(false);
      setRemoveConfirmVisible(false);
    }
  }, [visible]);

  if (!item) return null;

  const title = item.title || item.name || "Unknown";
  const year = item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4);
  const backdropUrl = getBackdropUrl(item.backdropPath);
  const posterUrl = getPosterUrl(item.posterPath, "w342");

  // Prefer the freshly fetched detail status (has status4k); fall back to the
  // list item's mediaInfo while details load.
  const mediaInfo = detailsData?.mediaInfo ?? item.mediaInfo;
  const statusHd = mediaInfo?.status;
  const status4k = mediaInfo?.status4k;

  // Internal Seerr media id — only present once full details load and the title
  // is actually tracked. Required by deleteMedia (the list item's mediaInfo
  // carries status but no id).
  const mediaDbId = detailsData?.mediaInfo?.id;

  const isAvailableHd = statusHd === 5;
  const isPendingHd = statusHd === 2 || statusHd === 3;
  const canRequestHd = !isAvailableHd && !isPendingHd;

  const isAvailable4k = status4k === 5;
  const isPending4k = status4k === 2 || status4k === 3;
  const canRequest4k = has4kServer && !isAvailable4k && !isPending4k;

  const trailer = pickTrailer(detailsData?.relatedVideos);
  const submitting = quickKind !== null;

  // YouTube blocks embedding for most titles, so open the trailer in the
  // YouTube app (or browser) rather than an in-app player.
  const openTrailer = () => {
    if (!trailer) return;
    const url = trailer.url || `https://www.youtube.com/watch?v=${trailer.key}`;
    Linking.openURL(url).catch(() => {});
  };

  // One-tap request using Seerr's server defaults (4K resolves the default 4K
  // server). The advanced sheet covers picking a specific server/profile/root.
  const handleQuickRequest = async (kind: "hd" | "4k") => {
    setQuickError(null);
    setQuickKind(kind);
    const options = kind === "4k" ? { is4k: true } : undefined;
    try {
      if (isTv) {
        await requestTV.mutateAsync({ tmdbId: item.id, seasons: "all", options });
      } else {
        await requestMovie.mutateAsync({ tmdbId: item.id, options });
      }
      toast(`${title} has been requested${kind === "4k" ? " in 4K" : ""}`);
      onClose();
    } catch (err) {
      const message =
        getHttpErrorMessage(err) ??
        (err instanceof Error ? err.message : "Failed to request");
      setQuickError({ message, copyText: formatErrorForCopy(err) });
    } finally {
      setQuickKind(null);
    }
  };

  const openCustomize = () => {
    // Default the advanced sheet to the tier the user can actually request.
    setOptionsIs4k(!canRequestHd && canRequest4k);
    setOptionsVisible(true);
  };

  // Untrack the media in Seerr (resets status so it can be re-requested; does
  // not delete files). Keep this modal open afterwards — closing it in the same
  // tick as the confirm's dismiss would race the iOS pageSheet teardown (issue
  // #83). The status re-renders to "Request" once the cache invalidates.
  //
  // Tracked = Seerr holds a media record for either tier in any requested state:
  // pending (2) / processing (3) / partial (4) / available (5). status 1
  // (unknown) is excluded. Checked directly off the status because the
  // isPending*/isAvailable* flags above skip PARTIAL (4).
  const isTracked =
    mediaDbId !== undefined &&
    [statusHd, status4k].some((s) => s !== undefined && s >= 2);

  const handleRemoveMedia = () => {
    if (mediaDbId === undefined || removeMedia.isPending) return;
    setRemoveConfirmVisible(false);
    removeMedia.mutate(mediaDbId, {
      onSuccess: () => toast(`${title} removed from Seerr`),
      onError: (err) => toastError("Failed to remove media", err),
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <ScrollView bounces={false}>
          {/* Backdrop */}
          <View style={{ height: SCREEN_WIDTH * 0.56 }}>
            {backdropUrl ? (
              <Animated.View style={backdropFadeStyle} className="w-full h-full">
                <Image
                  source={{ uri: backdropUrl }}
                  className="w-full h-full"
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  transition={200}
                  recyclingKey={backdropUrl}
                  onLoad={() => { backdropOpacity.value = 1; }}
                />
              </Animated.View>
            ) : (
              <View className="w-full h-full bg-surface-light" />
            )}
            <View className="absolute inset-0 bg-background/40">
              <BlurView intensity={20} tint="dark" style={{ flex: 1 }} />
            </View>

            {/* Play overlay — quick access to the trailer from the backdrop.
                Rendered before the close button so the close tap stays on top. */}
            {trailer ? (
              <Pressable
                onPress={openTrailer}
                accessibilityRole="button"
                accessibilityLabel="Watch trailer"
                className="absolute inset-0 items-center justify-center active:opacity-80"
              >
                <View className="bg-black/55 rounded-full p-4 border border-white/25">
                  <Icon icon={Play} size={28} color="#fff" fill="#fff" />
                </View>
              </Pressable>
            ) : null}

            {/* Close button */}
            <Pressable
              onPress={onClose}
              className="absolute top-12 right-4 bg-black/50 rounded-full p-2 active:opacity-70"
            >
              <Icon icon={X} size={20} color="#fff" />
            </Pressable>
          </View>

          {/* Content */}
          <View className="px-4 -mt-16">
            <View className="flex-row gap-4">
              {/* Poster */}
              {posterUrl ? (
                <Animated.View style={posterFadeStyle}>
                  <Image
                    source={{ uri: posterUrl }}
                    className="rounded-xl bg-surface-light w-[8rem] h-[12rem]"
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={200}
                    recyclingKey={posterUrl}
                    onLoad={() => { posterModalOpacity.value = 1; }}
                  />
                </Animated.View>
              ) : (
                <View
                  className="rounded-xl bg-surface-light items-center justify-center w-[8rem] h-[12rem]"
                >
                  {item.mediaType === "movie" ? (
                    <Icon icon={Film} size={32} color="#71717a" />
                  ) : (
                    <Icon icon={Tv} size={32} color="#71717a" />
                  )}
                </View>
              )}

              {/* Title & meta */}
              <View className="flex-1 justify-end pb-1">
                <Text
                  className="text-zinc-100 text-xl font-bold"
                  numberOfLines={3}
                >
                  {title}
                </Text>
                <View className="flex-row items-center gap-2 mt-1.5">
                  {year && (
                    <Text className="text-zinc-400 text-sm">{year}</Text>
                  )}
                  <Text className="text-zinc-600 text-sm">
                    {item.mediaType === "movie" ? "Movie" : "TV Show"}
                  </Text>
                </View>
                {item.voteAverage > 0 && (
                  <View className="flex-row items-center gap-1 mt-2">
                    <Icon icon={Star} size={14} color="#eab308" fill="#eab308" />
                    <Text className="text-yellow-500 text-sm font-medium">
                      {item.voteAverage.toFixed(1)}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Trailer — opens in the YouTube app / browser */}
            {trailer ? (
              <Pressable
                onPress={openTrailer}
                accessibilityRole="button"
                accessibilityLabel="Watch trailer"
                className="mt-5 flex-row items-center justify-center gap-2 py-3 rounded-xl border border-border bg-surface-light active:opacity-70"
              >
                <Icon icon={Play} size={16} color="#e4e4e7" fill="#e4e4e7" />
                <Text className="text-zinc-100 font-semibold text-sm">
                  Watch Trailer
                </Text>
                <Icon icon={ExternalLink} size={14} color="#a1a1aa" />
              </Pressable>
            ) : null}

            {/* Request actions */}
            <View className="mt-3 gap-2.5">
              {/* HD / regular */}
              {canRequestHd ? (
                <Button
                  label="Request"
                  onPress={() => handleQuickRequest("hd")}
                  loading={quickKind === "hd"}
                  disabled={submitting}
                  icon={<Icon icon={Plus} size={16} color="#fff" />}
                  size="lg"
                  className="w-full"
                />
              ) : isAvailableHd ? (
                <StatusPill tone="success" icon={Check} label="Available" />
              ) : (
                <StatusPill tone="warning" icon={Clock} label="Requested" />
              )}

              {/* 4K — only when Seerr has a 4K-capable server for this type */}
              {has4kServer ? (
                canRequest4k ? (
                  <Pressable
                    onPress={() => handleQuickRequest("4k")}
                    disabled={submitting}
                    accessibilityRole="button"
                    accessibilityLabel="Request in 4K"
                    className={`flex-row items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-violet-600 ${submitting ? "opacity-50" : "active:opacity-80"}`}
                  >
                    {quickKind === "4k" ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <>
                        <Icon icon={Plus} size={16} color="#fff" />
                        <Text className="text-white font-semibold text-base">
                          Request 4K
                        </Text>
                      </>
                    )}
                  </Pressable>
                ) : isAvailable4k ? (
                  <StatusPill
                    tone="success"
                    icon={Check}
                    label="Available in 4K"
                  />
                ) : (
                  <StatusPill
                    tone="warning"
                    icon={Clock}
                    label="Requested in 4K"
                  />
                )
              ) : null}

              {/* Advanced options */}
              {canRequestHd || canRequest4k ? (
                <Pressable
                  onPress={openCustomize}
                  disabled={submitting}
                  accessibilityRole="button"
                  accessibilityLabel="Customize request"
                  className="flex-row items-center justify-center gap-1.5 py-2 active:opacity-60"
                >
                  <Icon icon={SlidersHorizontal} size={14} color="#a1a1aa" />
                  <Text className="text-zinc-400 text-sm">
                    Customize request
                  </Text>
                </Pressable>
              ) : null}

              <RequestErrorBanner error={quickError} />

              {/* Remove from Seerr — untracks the media so it can be requested
                  again. Only shown once the title is tracked. */}
              {isTracked ? (
                <Pressable
                  onPress={() => setRemoveConfirmVisible(true)}
                  disabled={submitting || removeMedia.isPending}
                  accessibilityRole="button"
                  accessibilityLabel="Remove from Seerr"
                  className={`flex-row items-center justify-center gap-2 py-3 rounded-xl border border-danger/30 bg-danger/10 ${submitting || removeMedia.isPending ? "opacity-50" : "active:opacity-70"}`}
                >
                  {removeMedia.isPending ? (
                    <ActivityIndicator size="small" color="#ef4444" />
                  ) : (
                    <>
                      <Icon icon={Trash2} size={16} color="#ef4444" />
                      <Text className="text-danger font-medium text-sm">
                        Remove from Seerr
                      </Text>
                    </>
                  )}
                </Pressable>
              ) : null}
            </View>

            {/* Overview */}
            {item.overview ? (
              <View className="mt-5">
                <Text className="text-zinc-300 text-sm font-semibold mb-2">
                  Overview
                </Text>
                <Text className="text-zinc-400 text-sm leading-5">
                  {item.overview}
                </Text>
              </View>
            ) : null}

            <View className="h-8" />
          </View>
        </ScrollView>

        <RequestOptionsSheet
          item={item}
          visible={optionsVisible}
          initialIs4k={optionsIs4k}
          onClose={() => setOptionsVisible(false)}
          onRequested={() => {
            if (Platform.OS === "ios") closeAfterOptions.current = true;
            else onClose();
          }}
          onClosed={() => {
            if (closeAfterOptions.current) {
              closeAfterOptions.current = false;
              onClose();
            }
          }}
        />

        <ConfirmModal
          visible={removeConfirmVisible}
          title="Remove media?"
          message={`Remove "${title}" from Seerr? It can be requested again afterwards. This does not delete files from your server.`}
          icon={Trash2}
          tone="danger"
          confirmLabel="Remove"
          onConfirm={handleRemoveMedia}
          onCancel={() => setRemoveConfirmVisible(false)}
        />
      </View>
    </Modal>
  );
}
