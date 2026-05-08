import { View, Pressable, Dimensions } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/ui/icon";
import { useUiScale } from "@/hooks/use-ui-scale";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
// Match `media-detail-hero.tsx` so the skeleton settles into the same shape
// the real hero will occupy — minimizes visual jump on data resolution.
const BACKDROP_HEIGHT = Math.round(SCREEN_WIDTH * 0.55);
const REM_BASE = 14;

interface MediaDetailSkeletonProps {
  // Shorter accordion list shown for series; movie body has none.
  showSeasonList?: boolean;
}

export function MediaDetailSkeleton({
  showSeasonList = false,
}: MediaDetailSkeletonProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scale = useUiScale();
  const rem = REM_BASE * scale;

  const posterW = 9 * rem;
  const posterH = 13.5 * rem;

  return (
    <ScreenWrapper edgeToEdge>
      {/* Hero skeleton — backdrop placeholder with the same gradient + back
          button placement used by the real hero. */}
      <View>
        <View
          style={{ height: BACKDROP_HEIGHT }}
          className="bg-surface-light"
        >
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
            onPress={() => router.back()}
            hitSlop={12}
            className="absolute left-3 bg-black/50 rounded-full p-2 active:opacity-70"
            style={{ top: insets.top + 8 }}
          >
            <Icon icon={ArrowLeft} size={22} color="#fff" />
          </Pressable>
        </View>

        <View className="items-center -mt-24 px-4">
          <Skeleton width={posterW} height={posterH} borderRadius={12} />
          <View className="mt-4 w-full items-center gap-2">
            <Skeleton width="65%" height={1.6 * rem} borderRadius={6} />
            <Skeleton width="38%" height={rem} borderRadius={4} />
            <View className="flex-row gap-2 mt-1">
              <Skeleton
                width={3.4 * rem}
                height={1.4 * rem}
                borderRadius={6}
              />
              <Skeleton
                width={5 * rem}
                height={1.4 * rem}
                borderRadius={10}
              />
            </View>
          </View>
        </View>
      </View>

      <View className="px-4 mt-6">
        {/* Action bar — 5 equal pills */}
        <View className="flex-row gap-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={i} className="flex-1">
              <Skeleton height={4.4 * rem} borderRadius={16} />
            </View>
          ))}
        </View>

        {/* Stats strip */}
        <Skeleton height={4.4 * rem} borderRadius={16} className="mb-5" />

        {/* File / progress block — section label + card */}
        <View className="mb-5">
          <Skeleton
            width={3.6 * rem}
            height={0.8 * rem}
            borderRadius={4}
            className="mb-2 ml-1"
          />
          <Skeleton height={8 * rem} borderRadius={16} />
        </View>

        {/* Overview — section label + 3 lines */}
        <View className="mb-5">
          <Skeleton
            width={5.2 * rem}
            height={0.8 * rem}
            borderRadius={4}
            className="mb-2 ml-1"
          />
          <View className="gap-1.5">
            <Skeleton height={rem} width="100%" />
            <Skeleton height={rem} width="95%" />
            <Skeleton height={rem} width="60%" />
          </View>
        </View>

        {/* Genres — section label + 3 chips */}
        <View className="mb-5">
          <Skeleton
            width={4 * rem}
            height={0.8 * rem}
            borderRadius={4}
            className="mb-2 ml-1"
          />
          <View className="flex-row gap-2">
            <Skeleton width={5 * rem} height={1.6 * rem} borderRadius={11} />
            <Skeleton width={6 * rem} height={1.6 * rem} borderRadius={11} />
            <Skeleton width={4.5 * rem} height={1.6 * rem} borderRadius={11} />
          </View>
        </View>

        {showSeasonList ? (
          <View>
            <Skeleton
              width={4.4 * rem}
              height={0.8 * rem}
              borderRadius={4}
              className="mb-2 ml-1"
            />
            <View className="gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton
                  key={i}
                  height={4 * rem}
                  borderRadius={16}
                />
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ScreenWrapper>
  );
}
