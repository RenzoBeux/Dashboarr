import { useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  Image,
  ScrollView,
  Dimensions,
} from "react-native";
import { X, Star, Check, Clock, Film, Tv, Plus } from "lucide-react-native";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { getPosterUrl, getBackdropUrl } from "@/services/overseerr-api";
import { useRequestMovie, useRequestTV } from "@/hooks/use-overseerr";
import type { OverseerrMediaResult } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface MediaDetailModalProps {
  item: OverseerrMediaResult | null;
  visible: boolean;
  onClose: () => void;
}

export function MediaDetailModal({
  item,
  visible,
  onClose,
}: MediaDetailModalProps) {
  const requestMovie = useRequestMovie();
  const requestTV = useRequestTV();
  const [requesting, setRequesting] = useState(false);
  const backdropOpacity = useSharedValue(0);
  const posterModalOpacity = useSharedValue(0);
  const backdropFadeStyle = useAnimatedStyle(() => ({ opacity: withTiming(backdropOpacity.value, { duration: 300 }) }));
  const posterFadeStyle = useAnimatedStyle(() => ({ opacity: withTiming(posterModalOpacity.value, { duration: 400 }) }));

  if (!item) return null;

  const title = item.title || item.name || "Unknown";
  const year =
    item.releaseDate?.slice(0, 4) || item.firstAirDate?.slice(0, 4);
  const backdropUrl = getBackdropUrl(item.backdropPath);
  const posterUrl = getPosterUrl(item.posterPath, "w342");
  const isAvailable = item.mediaInfo?.status === 5;
  const isPending =
    item.mediaInfo?.status === 2 || item.mediaInfo?.status === 3;
  const canRequest = !isAvailable && !isPending;

  const handleRequest = async () => {
    setRequesting(true);
    try {
      if (item.mediaType === "movie") {
        await requestMovie.mutateAsync(item.id);
      } else {
        await requestTV.mutateAsync({ tmdbId: item.id });
      }
      toast(`${title} has been requested`);
      onClose();
    } catch {
      toast("Failed to request", "error");
    } finally {
      setRequesting(false);
    }
  };

  const statusBadge = isAvailable
    ? { label: "Available", variant: "success" as const }
    : isPending
      ? { label: "Requested", variant: "warning" as const }
      : null;

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
                  resizeMode="cover"
                  onLoad={() => { backdropOpacity.value = 1; }}
                />
              </Animated.View>
            ) : (
              <View className="w-full h-full bg-surface-light" />
            )}
            <View className="absolute inset-0 bg-background/40">
              <BlurView intensity={20} tint="dark" style={{ flex: 1 }} />
            </View>

            {/* Close button */}
            <Pressable
              onPress={onClose}
              className="absolute top-12 right-4 bg-black/50 rounded-full p-2 active:opacity-70"
            >
              <X size={20} color="#fff" />
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
                    className="w-28 h-42 rounded-xl bg-surface-light"
                    style={{ width: 112, height: 168 }}
                    resizeMode="cover"
                    onLoad={() => { posterModalOpacity.value = 1; }}
                  />
                </Animated.View>
              ) : (
                <View
                  className="rounded-xl bg-surface-light items-center justify-center"
                  style={{ width: 112, height: 168 }}
                >
                  {item.mediaType === "movie" ? (
                    <Film size={32} color="#71717a" />
                  ) : (
                    <Tv size={32} color="#71717a" />
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
                <View className="flex-row items-center gap-3 mt-2">
                  {item.voteAverage > 0 && (
                    <View className="flex-row items-center gap-1">
                      <Star size={14} color="#eab308" fill="#eab308" />
                      <Text className="text-yellow-500 text-sm font-medium">
                        {item.voteAverage.toFixed(1)}
                      </Text>
                    </View>
                  )}
                  {statusBadge && (
                    <Badge
                      label={statusBadge.label}
                      variant={statusBadge.variant}
                    />
                  )}
                </View>
              </View>
            </View>

            {/* Request button */}
            <View className="mt-5">
              {canRequest ? (
                <Button
                  label={`Request ${item.mediaType === "movie" ? "Movie" : "TV Show"}`}
                  onPress={handleRequest}
                  loading={requesting}
                  icon={<Plus size={16} color="#fff" />}
                  size="lg"
                  className="w-full"
                />
              ) : isAvailable ? (
                <View className="flex-row items-center justify-center gap-2 py-3 bg-green-600/10 rounded-xl border border-green-600/30">
                  <Check size={18} color="#22c55e" />
                  <Text className="text-green-500 font-medium">
                    Already Available
                  </Text>
                </View>
              ) : (
                <View className="flex-row items-center justify-center gap-2 py-3 bg-yellow-600/10 rounded-xl border border-yellow-600/30">
                  <Clock size={18} color="#eab308" />
                  <Text className="text-yellow-500 font-medium">
                    Already Requested
                  </Text>
                </View>
              )}
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
      </View>
    </Modal>
  );
}
