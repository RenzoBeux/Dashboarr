import { useState, useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { EmptyState } from "@/components/ui/empty-state";
import { useConfigStore } from "@/store/config-store";
import { useAttachedKinds } from "@/hooks/use-active-dashboard";
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

  const switcher = showSwitcher ? (
    <LibrarySegmentedControl
      value={activeSection}
      sections={sections}
      onChange={setSection}
    />
  ) : null;

  // Both views render through ScreenWrapper themselves; the switcher is passed
  // as their topSlot so it sits above the service header. Switching between
  // <MoviesView/> and <TvView/> naturally remounts (different component types),
  // resetting each view's internal sub-tab/filter state.
  return activeSection === "movies" ? (
    <MoviesView topSlot={switcher} />
  ) : (
    <TvView topSlot={switcher} />
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
