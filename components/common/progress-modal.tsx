import { useEffect } from "react";
import { Modal, View } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
  FadeIn,
  ReduceMotion,
} from "react-native-reanimated";
import { Loader2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";

interface ProgressModalProps {
  visible: boolean;
  title: string;
  subtitle?: string;
}

export function ProgressModal({ visible, title, subtitle }: ProgressModalProps) {
  const rotation = useSharedValue(0);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      // ReduceMotion.Never on both loops: a progress spinner/halo must keep
      // moving even with the OS "Reduce Motion" setting on, or it freezes and
      // looks like the operation hung. The 5th withRepeat arg governs whether
      // the infinite repeat starts (same root cause as #196).
      rotation.value = 0;
      rotation.value = withRepeat(
        withTiming(360, {
          duration: 1100,
          easing: Easing.linear,
          reduceMotion: ReduceMotion.Never,
        }),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      );
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.15, {
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
          withTiming(1, {
            duration: 900,
            easing: Easing.inOut(Easing.quad),
            reduceMotion: ReduceMotion.Never,
          }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.Never,
      );
    } else {
      cancelAnimation(rotation);
      cancelAnimation(pulse);
    }
  }, [visible, rotation, pulse]);

  const spinnerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const haloStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
    opacity: 2 - pulse.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View className="flex-1 bg-black/85 items-center justify-center px-8">
        <View className="items-center gap-7">
          <View className="w-20 h-20 items-center justify-center">
            <Animated.View
              style={haloStyle}
              className="absolute w-20 h-20 rounded-full bg-primary/20"
            />
            <Animated.View style={spinnerStyle}>
              <Icon icon={Loader2} size={52} color="#60a5fa" strokeWidth={2.25} />
            </Animated.View>
          </View>

          <View className="items-center gap-1.5">
            <Animated.Text
              key={title}
              entering={FadeIn.duration(220)}
              className="text-zinc-100 text-lg font-semibold tracking-tight"
            >
              {title}
            </Animated.Text>
            {subtitle ? (
              <Animated.Text
                key={subtitle}
                entering={FadeIn.duration(260)}
                className="text-zinc-400 text-sm text-center leading-5 max-w-[20rem]"
              >
                {subtitle}
              </Animated.Text>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}
