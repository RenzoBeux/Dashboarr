import { useState, useEffect } from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
import { lightHaptic } from "@/lib/haptics";
import { MoviesView } from "@/components/radarr/movies-view";
import { TvView } from "@/components/sonarr/tv-view";

type LibrarySection = "movies" | "tv";

// Combined Library tab: hosts the Movies (Radarr) and TV (Sonarr) libraries
// behind a top segmented control. When only one of the two is available it
// renders that view directly (no switcher), mirroring the Downloads tab's
// single-client behavior.
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

  const showSwitcher = sections.length > 1;
  const activeSection: LibrarySection = sections.includes(section)
    ? section
    : sections[0];

  const handleSectionChange = (next: LibrarySection) => {
    if (next === activeSection) return;
    lightHaptic();
    setSection(next);
  };

  const switcher = showSwitcher ? (
    <LibrarySegmentedControl
      value={activeSection}
      sections={sections}
      onChange={handleSectionChange}
    />
  ) : null;

  // Single section: render directly, no animation needed.
  if (!showSwitcher) {
    return activeSection === "movies" ? (
      <MoviesView topSlot={switcher} />
    ) : (
      <TvView topSlot={switcher} />
    );
  }

  // Both sections: keep BOTH views mounted as cross-fading layers. Switching
  // no longer remounts/refetches — each view's scroll position, sub-tab and
  // loaded data are preserved, and the inactive view stays warm so the swap is
  // instant. The two switchers sit at the same spot, so the highlight appears
  // to glide across as the layers cross-fade. Movies slides off to the left and
  // TV in from the right (and vice-versa) for a subtle directional feel.
  return (
    <View className="flex-1 bg-background">
      <SectionLayer active={activeSection === "movies"} offset={-16}>
        <MoviesView topSlot={switcher} />
      </SectionLayer>
      <SectionLayer active={activeSection === "tv"} offset={16}>
        <TvView topSlot={switcher} />
      </SectionLayer>
    </View>
  );
}

// One absolutely-positioned, cross-fading layer. `offset` is where it rests
// (px) while inactive — negative slides it left, positive right — so the two
// layers move in opposite directions during the transition.
function SectionLayer({
  active,
  offset,
  children,
}: {
  active: boolean;
  offset: number;
  children: React.ReactNode;
}) {
  const progress = useSharedValue(active ? 1 : 0);
  useEffect(() => {
    progress.value = withTiming(active ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateX: (1 - progress.value) * offset }],
  }));

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents={active ? "auto" : "none"}
    >
      {children}
    </Animated.View>
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
