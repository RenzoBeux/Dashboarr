import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  Dimensions,
  StyleSheet,
} from "react-native";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Check,
  Film,
  Tv,
  Building2,
  Radio,
  Tag,
  Search,
  MonitorPlay,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
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
import { useBottomInset } from "@/hooks/use-bottom-inset";
import { ICON } from "@/lib/constants";
import { lightHaptic } from "@/lib/haptics";
import { GlassSurface } from "@/components/ui/glass-surface";
import { useOverseerrGenreSlider } from "@/hooks/use-overseerr";
import { NETWORKS, STUDIOS } from "@/lib/overseerr-discover";
import { DiscoverSliderType, type DiscoverSliderTypeValue } from "@/lib/types";

const { height: SCREEN_H } = Dimensions.get("window");
const SHEET_MAX = Math.round(SCREEN_H * 0.85);
const OFFSCREEN = SHEET_MAX + 140;

export interface NewSliderPayload {
  type: DiscoverSliderTypeValue;
  title: string;
  data: string;
}

type AddKind =
  | "genre-movie"
  | "genre-tv"
  | "studio"
  | "network"
  | "search"
  | "keyword-movie"
  | "keyword-tv"
  | "streaming-movie"
  | "streaming-tv";

interface AddTypeOption {
  kind: AddKind;
  type: DiscoverSliderTypeValue;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
  // "picker" → choose a value from a list (no keyboard). "text" → free-text
  // entry of the value (and a title).
  mode: "picker" | "text";
}

const ADD_TYPES: AddTypeOption[] = [
  {
    kind: "genre-movie",
    type: DiscoverSliderType.TMDB_MOVIE_GENRE,
    label: "Movie Genre",
    description: "Movies in a genre",
    icon: Film,
    mode: "picker",
  },
  {
    kind: "genre-tv",
    type: DiscoverSliderType.TMDB_TV_GENRE,
    label: "TV Genre",
    description: "Shows in a genre",
    icon: Tv,
    mode: "picker",
  },
  {
    kind: "studio",
    type: DiscoverSliderType.TMDB_STUDIO,
    label: "Studio",
    description: "Movies from a studio",
    icon: Building2,
    mode: "picker",
  },
  {
    kind: "network",
    type: DiscoverSliderType.TMDB_NETWORK,
    label: "Network",
    description: "Shows from a network",
    icon: Radio,
    mode: "picker",
  },
  {
    kind: "search",
    type: DiscoverSliderType.TMDB_SEARCH,
    label: "Search",
    description: "Results for a search term",
    icon: Search,
    mode: "text",
  },
  {
    kind: "keyword-movie",
    type: DiscoverSliderType.TMDB_MOVIE_KEYWORD,
    label: "Movie Keyword",
    description: "Movies with a TMDB keyword id",
    icon: Tag,
    mode: "text",
  },
  {
    kind: "keyword-tv",
    type: DiscoverSliderType.TMDB_TV_KEYWORD,
    label: "TV Keyword",
    description: "Shows with a TMDB keyword id",
    icon: Tag,
    mode: "text",
  },
  {
    kind: "streaming-movie",
    type: DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES,
    label: "Movie Streaming Service",
    description: "Movies on a provider id (US region)",
    icon: MonitorPlay,
    mode: "text",
  },
  {
    kind: "streaming-tv",
    type: DiscoverSliderType.TMDB_TV_STREAMING_SERVICES,
    label: "TV Streaming Service",
    description: "Shows on a provider id (US region)",
    icon: MonitorPlay,
    mode: "text",
  },
];

interface PickerValue {
  id: number;
  name: string;
}

interface AddSliderSheetProps {
  visible: boolean;
  onClose: () => void;
  // Called when the user finishes building a section. The parent stages it into
  // the editor draft (nothing is persisted until the editor's Save).
  onAdd: (payload: NewSliderPayload) => void;
}

// Self-contained add-section flow: pick a type, then pick or type a value — all
// inside a single bottom sheet (one Modal, internal step state) so it never
// stacks a second native modal over itself (the iOS Fabric hang). On completion
// it calls onAdd and closes; the editor appends the result to its draft.
export function AddSliderSheet({ visible, onClose, onAdd }: AddSliderSheetProps) {
  const bottomInset = useBottomInset();
  const [mounted, setMounted] = useState(false);
  const [chosen, setChosen] = useState<AddTypeOption | null>(null);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");

  const movieGenres = useOverseerrGenreSlider("movie");
  const tvGenres = useOverseerrGenreSlider("tv");

  const translateY = useSharedValue(OFFSCREEN);
  const backdrop = useSharedValue(0);
  const keyboard = useReanimatedKeyboardAnimation();

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setChosen(null);
      setTitle("");
      setValue("");
      translateY.value = withSpring(0, { damping: 24, stiffness: 210, mass: 0.9 });
      backdrop.value = withTiming(1, { duration: 180 });
    } else if (mounted) {
      backdrop.value = withTiming(0, { duration: 160 });
      translateY.value = withTiming(
        OFFSCREEN,
        { duration: 220, easing: Easing.in(Easing.cubic) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
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

  function pickType(option: AddTypeOption) {
    lightHaptic();
    setChosen(option);
    setTitle("");
    setValue("");
  }

  function pickValue(v: PickerValue) {
    if (!chosen) return;
    lightHaptic();
    onAdd({ type: chosen.type, title: v.name, data: String(v.id) });
    onClose();
  }

  function submitText() {
    if (!chosen) return;
    const isSearch = chosen.kind === "search";
    const trimmedValue = value.trim();
    const trimmedTitle = (isSearch ? value : title).trim();
    if (trimmedValue.length === 0 || trimmedTitle.length === 0) return;
    lightHaptic();
    onAdd({ type: chosen.type, title: trimmedTitle, data: trimmedValue });
    onClose();
  }

  const pickerValues: PickerValue[] = (() => {
    if (!chosen) return [];
    switch (chosen.kind) {
      case "genre-movie":
        return (movieGenres.data ?? []).map((g) => ({ id: g.id, name: g.name }));
      case "genre-tv":
        return (tvGenres.data ?? []).map((g) => ({ id: g.id, name: g.name }));
      case "studio":
        return STUDIOS.map((s) => ({ id: s.id, name: s.name }));
      case "network":
        return NETWORKS.map((n) => ({ id: n.id, name: n.name }));
      default:
        return [];
    }
  })();

  const pickerLoading =
    chosen?.kind === "genre-movie"
      ? movieGenres.isLoading
      : chosen?.kind === "genre-tv"
        ? tvGenres.isLoading
        : false;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
        <View className="flex-1 justify-end">
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <Pressable onPress={onClose} className="flex-1 bg-black/70" />
          </Animated.View>

          <Animated.View
            style={[
              sheetStyle,
              {
                maxHeight: SHEET_MAX,
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
                <View className="flex-row items-center justify-between px-5 pt-3 pb-3">
                  <View className="flex-row items-center flex-1 pr-3 gap-2">
                    {chosen && (
                      <Pressable
                        onPress={() => setChosen(null)}
                        hitSlop={10}
                        className="active:opacity-70"
                      >
                        <Icon icon={ChevronLeft} size={22} color="#a1a1aa" />
                      </Pressable>
                    )}
                    <Text
                      className="text-zinc-100 text-lg font-bold flex-1"
                      numberOfLines={1}
                    >
                      {chosen ? chosen.label : "Add a section"}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={10}
                    className="w-9 h-9 rounded-full bg-surface-light items-center justify-center active:opacity-70"
                  >
                    <Icon icon={X} size={ICON.SM} color="#a1a1aa" />
                  </Pressable>
                </View>
                <View className="h-px bg-border/60 mx-5 mb-1" />
              </View>
            </GestureDetector>

            <ScrollView
              contentContainerClassName="px-3 pt-2 pb-2"
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Step 1 — choose a section type */}
              {!chosen &&
                ADD_TYPES.map((opt) => (
                  <Pressable
                    key={opt.kind}
                    onPress={() => pickType(opt)}
                    className="flex-row items-center gap-3 rounded-2xl px-3 py-3 mb-1 active:bg-surface-light/70"
                  >
                    <View className="w-10 h-10 rounded-xl bg-surface-light items-center justify-center">
                      <Icon icon={opt.icon} size={20} color="#a1a1aa" />
                    </View>
                    <View className="flex-1">
                      <Text className="text-zinc-100 text-base font-medium">
                        {opt.label}
                      </Text>
                      <Text className="text-zinc-500 text-xs mt-0.5">
                        {opt.description}
                      </Text>
                    </View>
                    <Icon icon={ChevronRight} size={ICON.SM} color="#52525b" />
                  </Pressable>
                ))}

              {/* Step 2a — pick a value from a list */}
              {chosen && chosen.mode === "picker" && (
                <>
                  {pickerLoading ? (
                    <Text className="text-zinc-500 text-center py-6">Loading…</Text>
                  ) : pickerValues.length === 0 ? (
                    <Text className="text-zinc-500 text-center py-6">
                      Nothing to choose from.
                    </Text>
                  ) : (
                    pickerValues.map((v) => (
                      <Pressable
                        key={v.id}
                        onPress={() => pickValue(v)}
                        className="flex-row items-center justify-between rounded-2xl px-3 py-3 mb-1 active:bg-surface-light/70"
                      >
                        <Text className="text-zinc-100 text-base font-medium flex-1">
                          {v.name}
                        </Text>
                        <Icon icon={ChevronRight} size={ICON.SM} color="#52525b" />
                      </Pressable>
                    ))
                  )}
                </>
              )}

              {/* Step 2b — free-text value (search / keyword / streaming) */}
              {chosen && chosen.mode === "text" && (
                <View className="px-2 pt-1 gap-3">
                  {chosen.kind !== "search" && (
                    <View>
                      <Text className="text-zinc-400 text-sm mb-1.5">
                        Section title
                      </Text>
                      <TextInput
                        value={title}
                        onChangeText={setTitle}
                        placeholder="e.g. On Netflix"
                        placeholderTextColor="#52525b"
                        className="bg-surface-light border border-border rounded-xl px-4 py-3 text-zinc-100 text-base"
                      />
                    </View>
                  )}
                  <View>
                    <Text className="text-zinc-400 text-sm mb-1.5">
                      {chosen.kind === "search"
                        ? "Search term"
                        : chosen.kind.startsWith("keyword")
                          ? "TMDB keyword id"
                          : "Watch provider id"}
                    </Text>
                    <TextInput
                      value={value}
                      onChangeText={setValue}
                      placeholder={
                        chosen.kind === "search"
                          ? "e.g. Marvel"
                          : "e.g. 8"
                      }
                      placeholderTextColor="#52525b"
                      autoCapitalize="none"
                      keyboardType={
                        chosen.kind === "search" ? "default" : "number-pad"
                      }
                      className="bg-surface-light border border-border rounded-xl px-4 py-3 text-zinc-100 text-base"
                    />
                    {chosen.kind !== "search" && (
                      <Text className="text-zinc-600 text-xs mt-1.5">
                        {chosen.kind.startsWith("keyword")
                          ? "Find a keyword id on themoviedb.org (the number in /keyword/<id>)."
                          : "Find a provider id via TMDB watch-provider data (e.g. Netflix = 8)."}
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={submitText}
                    className="flex-row items-center justify-center gap-2 bg-primary rounded-xl py-3 mt-1 active:opacity-80"
                  >
                    <Icon icon={Check} size={ICON.SM} color="#fff" />
                    <Text className="text-white text-sm font-semibold">
                      Add section
                    </Text>
                  </Pressable>
                </View>
              )}
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}
