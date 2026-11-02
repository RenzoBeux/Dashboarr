import { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper, useScreenSafeAreaEdges } from "@/components/common/screen-wrapper";
import { DemoBanner } from "@/components/common/demo-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LibrarySwipeHint } from "@/components/onboarding/library-swipe-hint";
import { useConfigStore } from "@/store/config-store";
import { useIntroStore } from "@/store/intro-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { lightHaptic } from "@/lib/haptics";
import { MoviesView } from "@/components/radarr/movies-view";
import { TvView } from "@/components/sonarr/tv-view";
import { SegmentedControl } from "@/components/ui/segmented-control";

type LibrarySection = "movies" | "tv";

// Combined Library tab: hosts the Movies (Radarr) and TV (Sonarr) libraries
// behind a single fixed segmented control. The control stays put while the
// content pages horizontally underneath it (see LibraryPager) — so switching
// reads as "one screen, paging content", not swapping whole screens. When only
// one of the two is available it renders that view directly (no switcher).
export default function LibraryScreen() {
  const radarrEnabled = useConfigStore((s) => s.services.radarr?.enabled ?? false);
  const sonarrEnabled = useConfigStore((s) => s.services.sonarr?.enabled ?? false);
  const attachedKinds = useAttachedKinds();

  // Only show sections whose service is enabled globally AND attached to the
  // active dashboard — same workspace filter the Downloads tab applies.
  const sections: LibrarySection[] = [];
  if (radarrEnabled && attachedKinds.has("radarr")) sections.push("movies");
  if (sonarrEnabled && attachedKinds.has("sonarr")) sections.push("tv");

  // `?section=movies|tv` lets the Services tab / Status widget deep-link to a
  // specific section instead of always landing on the first one.
  const { section: sectionParam } = useLocalSearchParams<{ section?: string }>();
  const paramSection =
    sectionParam === "movies" || sectionParam === "tv" ? sectionParam : undefined;

  const [section, setSection] = useState<LibrarySection>(
    paramSection && sections.includes(paramSection)
      ? paramSection
      : sections[0] ?? "movies",
  );

  useEffect(() => {
    if (paramSection && sections.includes(paramSection) && paramSection !== section) {
      setSection(paramSection);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramSection]);

  if (sections.length === 0) {
    return (
      <ScreenWrapper>
        <EmptyState
          title="No library configured"
          message="Enable Radarr or Sonarr in Settings → Integrations to browse your library."
        />
      </ScreenWrapper>
    );
  }

  const activeSection: LibrarySection = sections.includes(section)
    ? section
    : sections[0];

  // Single section: render the standalone view (its own safe area + chrome).
  if (sections.length === 1) {
    return activeSection === "movies" ? <MoviesView /> : <TvView />;
  }

  return (
    <LibraryPager
      sections={sections}
      activeSection={activeSection}
      onChange={setSection}
    />
  );
}

// Fixed segmented control + a native horizontal paging ScrollView. Both views
// stay mounted (no remount/refetch on switch); only the pages scroll, so the
// control and safe area never move. A native paging ScrollView (rather than a
// custom pan) is used so it direction-locks cleanly against the poster lists'
// own vertical scrolling. A one-time coachmark teaches the swipe.
function LibraryPager({
  sections,
  activeSection,
  onChange,
}: {
  sections: LibrarySection[];
  activeSection: LibrarySection;
  onChange: (next: LibrarySection) => void;
}) {
  const { width } = useWindowDimensions();
  const safeAreaEdges = useScreenSafeAreaEdges();
  const activeIndex = sections.indexOf(activeSection);
  const scrollRef = useRef<React.ComponentRef<typeof Animated.ScrollView>>(null);
  // Live horizontal scroll position (0..(n-1)*width), used to drive the
  // segmented control's sliding highlight so it tracks the swipe.
  const scrollX = useSharedValue(activeIndex * width);
  // Live page position as a fractional index; the segmented control's pill
  // tracks it so the header glides in lockstep with the swipe (and with the
  // animated scroll on tap).
  const pageProgress = useDerivedValue(() =>
    width > 0 ? scrollX.value / width : 0,
  );
  // Pages need an explicit height inside a horizontal ScrollView; measure the
  // available area once it lays out.
  const [pageHeight, setPageHeight] = useState(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  // One-time swipe coachmark: shown once (after hydration) until dismissed.
  const hydrated = useIntroStore((s) => s.hydrated);
  const hintSeen = useIntroStore((s) => s.librarySwipeHintSeen);
  const markHintSeen = useIntroStore((s) => s.markLibrarySwipeHintSeen);
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if (hydrated && !hintSeen) setShowHint(true);
  }, [hydrated, hintSeen]);

  const dismissHint = useCallback(() => {
    setShowHint(false);
    if (!hintSeen) markHintSeen();
  }, [hintSeen, markHintSeen]);

  const scrollToIndex = useCallback(
    (idx: number, animated = true) => {
      scrollRef.current?.scrollTo({ x: idx * width, animated });
    },
    [width],
  );

  // A tap scrolls imperatively (below) on the same tick; this flag skips the
  // redundant state-driven re-scroll that would otherwise follow.
  const skipSyncRef = useRef(false);
  const didInitialScroll = useRef(false);

  // Sync the scroll position with deep-link changes / first mount / rotation.
  // (After a swipe the list is already there, so this is a no-op.)
  useEffect(() => {
    if (pageHeight === 0) return;
    if (skipSyncRef.current) {
      skipSyncRef.current = false;
      return;
    }
    // First positioning (e.g. deep-linked to TV) is instant; later syncs animate.
    scrollToIndex(activeIndex, didInitialScroll.current);
    didInitialScroll.current = true;
  }, [activeIndex, width, pageHeight, scrollToIndex]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    const next = sections[idx];
    if (next && next !== activeSection) onChange(next);
  };

  // Tap → start the slide on the SAME tick instead of waiting for the
  // state-driven effect (which only runs after the heavy re-render + paint).
  // That render latency was the perceived delay. State catches up right after.
  const handleTap = (next: LibrarySection) => {
    const idx = sections.indexOf(next);
    if (idx === activeIndex) return;
    lightHaptic();
    dismissHint();
    skipSyncRef.current = true;
    scrollToIndex(idx);
    onChange(next);
  };

  return (
    <SafeAreaView edges={safeAreaEdges} className="flex-1 bg-background">
      <DemoBanner />
      <View className="px-4">
        <SegmentedControl
          options={sections.map((s) => ({ value: s, label: SECTION_LABELS[s] }))}
          value={activeSection}
          onChange={handleTap}
          progress={pageProgress}
          className="mt-2 mb-2"
        />
      </View>
      <View
        className="flex-1"
        onLayout={(e) => setPageHeight(e.nativeEvent.layout.height)}
      >
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={scrollHandler}
          onScrollBeginDrag={dismissHint}
          onMomentumScrollEnd={onMomentumScrollEnd}
        >
          {sections.map((s) => (
            <View key={s} style={{ width, height: pageHeight }}>
              {s === "movies" ? <MoviesView embedded /> : <TvView embedded />}
            </View>
          ))}
        </Animated.ScrollView>
        {showHint ? <LibrarySwipeHint onDismiss={dismissHint} /> : null}
      </View>
    </SafeAreaView>
  );
}

const SECTION_LABELS: Record<LibrarySection, string> = {
  movies: "Movies",
  tv: "TV",
};
