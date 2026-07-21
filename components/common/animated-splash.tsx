import { useCallback, useEffect, useRef } from "react";
import { StyleSheet, Text, useWindowDimensions } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, G, LinearGradient, Path, Stop } from "react-native-svg";

// Geometry and colors mirror scripts/generate-icon.js (the source of truth for
// the brand badge). If the badge design changes there, update these to match —
// the overlay must render the exact frame the native splash.png shows so the
// native → JS handoff is invisible.
const RING_ARC = "M 347 797.8 A 330 330 0 1 1 677 797.8";
const D_PATH = `
    M 282 232
    L 500 232
    C 662 232 782 356 782 512
    C 782 668 662 792 500 792
    L 282 792
    C 258 792 242 776 242 752
    L 242 272
    C 242 248 258 232 282 232
    Z
    M 392 372
    L 490 372
    C 576 372 636 432 636 512
    C 636 592 576 652 490 652
    L 392 652
    Z
`;
const D_COLOR = "#f2f4fc";
const SPLASH_BG = "#09090b";

// splash.png canvas the native splash renders with resizeMode "cover".
const SPLASH_W = 1284;
const SPLASH_H = 2778;
const BADGE_CY = 1190; // badge center y in splash canvas
const BADGE_SCALE = 0.6; // badge drawn at 0.6 of its 1024 viewBox
const TITLE_BASELINE = 1530;
const TITLE_SIZE = 82;
const SUBTITLE_BASELINE = 1595;
const SUBTITLE_SIZE = 28;

// translate(512 512) scale(0.6) translate(-487 -512) collapsed to one step
// (the 487 is the optical-centering shift from generate-icon.js).
const D_TRANSFORM = "translate(219.8, 204.8) scale(0.6)";

function RingSvg() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1024 1024">
      <Defs>
        <LinearGradient id="brand" x1="0%" y1="70%" x2="100%" y2="30%">
          <Stop offset="0%" stopColor="#06d6a0" />
          <Stop offset="50%" stopColor="#3a86ff" />
          <Stop offset="100%" stopColor="#8b5cf6" />
        </LinearGradient>
      </Defs>
      <Path
        d={RING_ARC}
        fill="none"
        stroke="url(#brand)"
        strokeWidth={60}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function DSvg() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 1024 1024">
      <G transform={D_TRANSFORM}>
        <Path d={D_PATH} fill={D_COLOR} fillRule="evenodd" />
      </G>
    </Svg>
  );
}

/**
 * JS continuation of the native splash. Renders the same frame the static
 * splash.png shows (same cover-fit math), hides the native splash once laid
 * out, then plays the exit choreography: the broken ring does one gauge
 * sweep while the D pulses, then the badge zooms through and the overlay
 * fades out to reveal the app.
 *
 * pointerEvents="none" so it can never trap touches, and a timer backstop
 * guarantees onDone fires even if an animation callback is swallowed
 * (e.g. OS Reduce Motion snapping timings to their end state).
 */
export function AnimatedSplash({ onDone }: { onDone: () => void }) {
  const { width, height } = useWindowDimensions();

  // Same mapping the native splash applies to splash.png with cover resize:
  // scale so both dimensions are covered, image center pinned to screen center.
  const scale = Math.max(width / SPLASH_W, height / SPLASH_H);
  const badgeSize = 1024 * BADGE_SCALE * scale;
  const badgeTop = height / 2 + (BADGE_CY - SPLASH_H / 2) * scale - badgeSize / 2;
  const titleSize = TITLE_SIZE * scale;
  const subtitleSize = SUBTITLE_SIZE * scale;
  const titleTop = height / 2 + (TITLE_BASELINE - SPLASH_H / 2) * scale - titleSize;
  const subtitleTop =
    height / 2 + (SUBTITLE_BASELINE - SPLASH_H / 2) * scale - subtitleSize;

  const ringRotate = useSharedValue(0);
  const ringScale = useSharedValue(1);
  const dScale = useSharedValue(1);
  const badgeScale = useSharedValue(1);
  const textOpacity = useSharedValue(1);
  const textShift = useSharedValue(0);
  const overlayOpacity = useSharedValue(1);

  const doneRef = useRef(false);
  const finish = useCallback(() => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  }, [onDone]);

  const startedRef = useRef(false);
  const handleLayout = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    // Wait one frame so this overlay is actually on screen before the native
    // splash goes away — the two frames are identical, so the swap is invisible.
    requestAnimationFrame(() => {
      SplashScreen.hideAsync().catch(() => {});

      // Gauge sweep: one full ring revolution (gap returns to the bottom).
      ringRotate.value = withTiming(360, {
        duration: 620,
        easing: Easing.bezier(0.6, 0, 0.3, 1),
      });
      // The D breathes once while the ring sweeps.
      dScale.value = withSequence(
        withTiming(1.05, { duration: 260, easing: Easing.out(Easing.quad) }),
        withTiming(1, { duration: 240, easing: Easing.in(Easing.quad) }),
      );
      // Text drops away first…
      textOpacity.value = withDelay(340, withTiming(0, { duration: 200 }));
      textShift.value = withDelay(
        340,
        withTiming(10 * scale, { duration: 220, easing: Easing.in(Easing.quad) }),
      );
      // …then the badge zooms through the viewer (ring faster than the D for
      // depth) while the whole overlay fades to reveal the app.
      badgeScale.value = withDelay(
        360,
        withTiming(1.5, { duration: 320, easing: Easing.in(Easing.quad) }),
      );
      ringScale.value = withDelay(
        360,
        withTiming(1.3, { duration: 320, easing: Easing.in(Easing.quad) }),
      );
      overlayOpacity.value = withDelay(
        380,
        withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) }, () => {
          runOnJS(finish)();
        }),
      );
    });
  }, [
    scale,
    ringRotate,
    ringScale,
    dScale,
    badgeScale,
    textOpacity,
    textShift,
    overlayOpacity,
    finish,
  ]);

  // Backstop: never leave the overlay covering the app.
  useEffect(() => {
    const timer = setTimeout(finish, 2500);
    return () => clearTimeout(timer);
  }, [finish]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));
  const badgeStyle = useAnimatedStyle(() => ({
    transform: [{ scale: badgeScale.value }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${ringRotate.value}deg` }, { scale: ringScale.value }],
  }));
  const dStyle = useAnimatedStyle(() => ({
    transform: [{ scale: dScale.value }],
  }));
  const textStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
    transform: [{ translateY: textShift.value }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      onLayout={handleLayout}
      style={[styles.overlay, overlayStyle]}
    >
      <Animated.View
        style={[
          {
            position: "absolute",
            left: width / 2 - badgeSize / 2,
            top: badgeTop,
            width: badgeSize,
            height: badgeSize,
          },
          badgeStyle,
        ]}
      >
        <Animated.View style={[StyleSheet.absoluteFill, ringStyle]}>
          <RingSvg />
        </Animated.View>
        <Animated.View style={[StyleSheet.absoluteFill, dStyle]}>
          <DSvg />
        </Animated.View>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, textStyle]} pointerEvents="none">
        <Text
          style={[
            styles.text,
            { top: titleTop, fontSize: titleSize, color: "#ffffff", fontWeight: "700" },
          ]}
        >
          Dashboarr
        </Text>
        <Text
          style={[
            styles.text,
            {
              top: subtitleTop,
              fontSize: subtitleSize,
              color: "#52525b",
              fontWeight: "400",
              letterSpacing: 4 * scale,
            },
          ]}
        >
          MEDIA SERVER MANAGER
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: SPLASH_BG,
    zIndex: 9999,
    elevation: 9999,
  },
  text: {
    position: "absolute",
    left: 0,
    right: 0,
    textAlign: "center",
  },
});
