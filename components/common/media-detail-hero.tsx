import type { ComponentType, ReactNode } from "react";
import {
  View,
  Text,
  Pressable,
  Dimensions,
  Platform,
} from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, Star, Film } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import type { RatingsBundle } from "@/lib/types";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Backdrop is shallower than the side-by-side variant: the focal point shifts
// below the backdrop into the centered poster + title block, so a shorter
// header keeps the page balanced.
const BACKDROP_HEIGHT = Math.round(SCREEN_WIDTH * 0.55);

interface MediaDetailHeroProps {
  backdropUrl?: string | null;
  posterUrl?: string | null;
  onBackdropError?: () => void;
  onPosterError?: () => void;
  title: string;
  metaLine?: string;
  ratings?: RatingsBundle;
  badges?: ReactNode;
  posterFallbackIcon?: ComponentType<any>;
  onBack?: () => void;
}

export function MediaDetailHero({
  backdropUrl,
  posterUrl,
  onBackdropError,
  onPosterError,
  title,
  metaLine,
  ratings,
  badges,
  posterFallbackIcon = Film,
  onBack,
}: MediaDetailHeroProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const handleBack = onBack ?? (() => router.back());

  const backdropOpacity = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const backdropFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(backdropOpacity.value, { duration: 300 }),
  }));
  const posterFadeStyle = useAnimatedStyle(() => ({
    opacity: withTiming(posterOpacity.value, { duration: 400 }),
  }));

  return (
    <View>
      <View style={{ height: BACKDROP_HEIGHT }} className="bg-surface-light">
        {backdropUrl ? (
          <Animated.View style={backdropFadeStyle} className="w-full h-full">
            <Image
              source={{ uri: backdropUrl }}
              className="w-full h-full"
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={backdropUrl}
              onLoad={() => {
                backdropOpacity.value = 1;
              }}
              onError={onBackdropError}
            />
          </Animated.View>
        ) : null}

        {/* Top blur strip behind the status bar / back button — keeps the
            backdrop legible without dimming the whole image. */}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: insets.top + 56,
            overflow: "hidden",
          }}
        >
          <BlurView
            intensity={Platform.OS === "ios" ? 30 : 18}
            tint="dark"
            style={{ flex: 1 }}
          />
          <LinearGradient
            colors={["rgba(9,9,11,0.45)", "transparent"]}
            locations={[0, 1]}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              top: 0,
              bottom: 0,
            }}
          />
        </View>

        {/* Stronger bottom fade — pulls the backdrop into the body so the
            centered poster reads as floating, not pasted on. */}
        <LinearGradient
          colors={["transparent", "rgba(9,9,11,0.7)", "rgba(9,9,11,1)"]}
          locations={[0, 0.6, 1]}
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: BACKDROP_HEIGHT * 0.75,
          }}
        />

        <Pressable
          onPress={handleBack}
          hitSlop={12}
          className="absolute left-3 bg-black/50 rounded-full p-2 active:opacity-70"
          style={{ top: insets.top + 8 }}
        >
          <Icon icon={ArrowLeft} size={22} color="#fff" />
        </Pressable>
      </View>

      {/* Centered poster — overlaps the backdrop's bottom edge by roughly
          half its height. */}
      <View className="items-center -mt-24 px-4">
        {posterUrl ? (
          <Animated.View style={posterFadeStyle} className="rounded-xl overflow-hidden border border-white/5">
            <Image
              source={{ uri: posterUrl }}
              className="bg-surface-light w-[9rem] h-[13.5rem]"
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
              recyclingKey={posterUrl}
              onLoad={() => {
                posterOpacity.value = 1;
              }}
              onError={onPosterError}
            />
          </Animated.View>
        ) : (
          <View className="rounded-xl bg-surface-light items-center justify-center w-[9rem] h-[13.5rem] border border-white/5">
            <Icon icon={posterFallbackIcon} size={32} color="#71717a" />
          </View>
        )}

        <Text
          className="text-zinc-100 text-2xl font-bold text-center mt-4"
          numberOfLines={3}
        >
          {title}
        </Text>
        {metaLine ? (
          <Text
            className="text-zinc-400 text-sm mt-1.5 text-center"
            numberOfLines={1}
          >
            {metaLine}
          </Text>
        ) : null}
        {hasAnyRating(ratings) || badges ? (
          <View className="flex-row items-center gap-2 mt-3 flex-wrap justify-center">
            <RatingChips ratings={ratings} />
            {badges}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function hasAnyRating(ratings?: RatingsBundle): boolean {
  if (!ratings) return false;
  return Boolean(
    (ratings.imdb?.value && ratings.imdb.value > 0) ||
      (ratings.tmdb?.value && ratings.tmdb.value > 0) ||
      (ratings.value && ratings.value > 0),
  );
}

function RatingChips({ ratings }: { ratings?: RatingsBundle }) {
  if (!ratings) return null;
  const imdb = ratings.imdb?.value && ratings.imdb.value > 0
    ? ratings.imdb.value
    : null;
  const tmdb = ratings.tmdb?.value && ratings.tmdb.value > 0
    ? ratings.tmdb.value
    : null;
  // Legacy flat shape: render once when no source bundle is present
  const legacy = !imdb && !tmdb && ratings.value && ratings.value > 0
    ? ratings.value
    : null;

  return (
    <>
      {imdb !== null ? <RatingChip label="IMDb" value={imdb} /> : null}
      {tmdb !== null ? <RatingChip label="TMDB" value={tmdb} /> : null}
      {legacy !== null ? <RatingChip value={legacy} /> : null}
    </>
  );
}

function RatingChip({ label, value }: { label?: string; value: number }) {
  return (
    <View className="flex-row items-center gap-1 bg-yellow-500/15 rounded-md px-1.5 py-0.5">
      <Icon icon={Star} size={12} color="#eab308" fill="#eab308" />
      {label ? (
        <Text className="text-yellow-400 text-[0.65rem] font-bold uppercase">
          {label}
        </Text>
      ) : null}
      <Text className="text-yellow-400 text-xs font-semibold">
        {value.toFixed(1)}
      </Text>
    </View>
  );
}
