import { useState, useEffect } from "react";
import { View, Text, Pressable, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { DemoBanner } from "@/components/common/demo-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { lightHaptic } from "@/lib/haptics";
import { MoviesView } from "@/components/radarr/movies-view";
import { TvView } from "@/components/sonarr/tv-view";

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
          message="Enable Radarr or Sonarr in Settings to browse your library."
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
      onChange={(next) => {
        if (next === activeSection) return;
        lightHaptic();
        setSection(next);
      }}
    />
  );
}

// Fixed segmented control + horizontally paging content. Both views stay
// mounted (no remount/refetch on switch); only the content row translates, so
// the control and safe area never move.
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
  const activeIndex = sections.indexOf(activeSection);
  const offset = useSharedValue(-activeIndex * width);

  useEffect(() => {
    offset.value = withTiming(-activeIndex * width, {
      duration: 260,
      easing: Easing.out(Easing.cubic),
    });
  }, [activeIndex, width, offset]);

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <SafeAreaView edges={["top", "left", "right"]} className="flex-1 bg-background">
      <DemoBanner />
      <View className="px-4">
        <LibrarySegmentedControl
          value={activeSection}
          sections={sections}
          onChange={onChange}
        />
      </View>
      <View className="flex-1 overflow-hidden">
        <Animated.View
          style={[
            { flexDirection: "row", height: "100%", width: width * sections.length },
            rowStyle,
          ]}
        >
          {sections.map((s) => (
            <View key={s} style={{ width }}>
              {s === "movies" ? <MoviesView embedded /> : <TvView embedded />}
            </View>
          ))}
        </Animated.View>
      </View>
    </SafeAreaView>
  );
}

const SECTION_LABELS: Record<LibrarySection, string> = {
  movies: "Movies",
  tv: "TV",
};

function LibrarySegmentedControl({
  value,
  sections,
  onChange,
}: {
  value: LibrarySection;
  sections: LibrarySection[];
  onChange: (next: LibrarySection) => void;
}) {
  return (
    <View className="flex-row bg-surface-light rounded-2xl p-1 mt-2 mb-2">
      {sections.map((s) => (
        <Segment
          key={s}
          label={SECTION_LABELS[s]}
          active={value === s}
          onPress={() => onChange(s)}
        />
      ))}
    </View>
  );
}

function Segment({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-1 py-2 rounded-xl items-center active:opacity-70 ${active ? "bg-surface" : ""}`}
    >
      <Text className={`text-sm font-semibold ${active ? "text-zinc-100" : "text-zinc-400"}`}>
        {label}
      </Text>
    </Pressable>
  );
}
