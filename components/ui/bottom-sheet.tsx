import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
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
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { Icon } from "@/components/ui/icon";
import { GlassSurface } from "@/components/ui/glass-surface";
import { useBottomInset } from "@/hooks/use-bottom-inset";
import { useModalClosed } from "@/hooks/use-modal-closed";
import { ICON } from "@/lib/constants";

/**
 * The app's custom bottom sheet shell: a transparent `<Modal>` with a fading
 * backdrop, a spring-in panel on the glass surface, a drag handle + header
 * that pan-to-dismiss, a scrolling body and an optional pinned footer.
 *
 * It reports `onClosed` once the native modal is fully gone (via
 * `useModalClosed`), so it can be a `useModalFlow` step and chain into another
 * modal or a navigation on iOS without the #83 hang.
 *
 * The panel rides above the software keyboard (`useReanimatedKeyboardAnimation`
 * — its height is 0 while hidden), so a sheet may hold text inputs.
 *
 * Content stays rendered through the exit animation; callers that derive their
 * content from a nullable payload should keep the last value while closing.
 */
export function BottomSheet({
  visible,
  onClose,
  onClosed,
  header,
  footer,
  children,
  maxHeightRatio = 0.85,
  scroll = true,
  contentContainerClassName = "px-5 pt-4 pb-2",
}: {
  visible: boolean;
  onClose: () => void;
  onClosed?: () => void;
  // Rendered under the drag handle, inside the pan-to-dismiss area.
  header?: React.ReactNode;
  // Pinned below the body (action buttons).
  footer?: React.ReactNode;
  children?: React.ReactNode;
  maxHeightRatio?: number;
  // false when the body brings its own scroller (a FlatList, say).
  scroll?: boolean;
  contentContainerClassName?: string;
}) {
  const { height: screenH } = useWindowDimensions();
  const sheetMax = Math.round(screenH * maxHeightRatio);
  const offscreen = sheetMax + 140;

  const bottomInset = useBottomInset();
  const [mounted, setMounted] = useState(false);
  const handleDismiss = useModalClosed(mounted, onClosed);
  const translateY = useSharedValue(offscreen);
  const backdrop = useSharedValue(0);
  const keyboard = useReanimatedKeyboardAnimation();

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
        offscreen,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
    // Only the visibility edge drives the animation.
  }, [visible]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + keyboard.height.value }],
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

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
      onDismiss={handleDismiss}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable
              onPress={onClose}
              className="flex-1 bg-black/70"
              accessibilityRole="button"
              accessibilityLabel="Close"
            />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyle,
              {
                maxHeight: sheetMax,
                paddingBottom: bottomInset + 8,
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
                {header}
              </View>
            </GestureDetector>

            {scroll ? (
              <ScrollView
                contentContainerClassName={contentContainerClassName}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {children}
              </ScrollView>
            ) : (
              children
            )}

            {footer ? <View className="px-5 pt-2 pb-1">{footer}</View> : null}
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

/**
 * Standard sheet header: bold title, optional muted subtitle, close button,
 * and a hairline divider. Pass it as `BottomSheet`'s `header`.
 */
export function SheetTitleRow({
  title,
  subtitle,
  onClose,
  right,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  // Extra controls left of the close button.
  right?: React.ReactNode;
}) {
  return (
    <>
      <View className="flex-row items-start justify-between px-5 pt-3 pb-3">
        <View className="flex-1 pr-3">
          <Text className="text-zinc-100 text-base font-bold leading-5">
            {title}
          </Text>
          {subtitle ? (
            <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={2}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <View className="flex-row items-center gap-2">
          {right}
          <Pressable
            onPress={onClose}
            hitSlop={10}
            className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
          </Pressable>
        </View>
      </View>
      <View className="h-px bg-border/60 mx-5" />
    </>
  );
}
