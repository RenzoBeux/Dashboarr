import { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  ScrollView,
  useWindowDimensions,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import {
  Layers,
  ChevronsUpDown,
  SlidersHorizontal,
  LayoutDashboard,
  Film,
  Tv,
  Download,
  CalendarDays,
  type LucideIcon,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { lightHaptic } from "@/lib/haptics";
import { useUiScale } from "@/hooks/use-ui-scale";

// Each step renders inside a single card, so we keep the content compact and
// rely on rem-scaled typography (text-sm / text-base) so the carousel grows
// with the user's UI scale setting.
const STEPS: ReadonlyArray<{
  title: string;
  body: string;
  hero: (uiScale: number) => React.ReactNode;
}> = [
  {
    title: "Workspaces are your dashboards",
    body:
      "Group your services into Home, Cabin, Server — whatever fits how you actually use Dashboarr. Each workspace is its own dashboard.",
    hero: (uiScale) => <StackedCardsHero uiScale={uiScale} />,
  },
  {
    title: "Switch and customize",
    body:
      "Tap your dashboard name at the top to flip between workspaces. The slider icon next to it opens the editor — name, color, icon, and which services this workspace shows.",
    hero: () => <SwitchAndCustomizeHero />,
  },
  {
    title: "Tabs follow your workspace",
    body:
      "Pin the tabs you use most. Each workspace remembers its own bar — switch from Home to Server without losing your spot.",
    hero: () => <TabBarHero />,
  },
];

interface WorkspaceIntroOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

export function WorkspaceIntroOverlay({
  visible,
  onDismiss,
}: WorkspaceIntroOverlayProps) {
  const { width: screenWidth } = useWindowDimensions();
  const uiScale = useUiScale();
  // The carousel card is 92% of the screen — width matches the pager's child
  // width so paging snaps to step boundaries.
  const cardWidth = Math.round(screenWidth * 0.92);

  const [step, setStep] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Reset to step 0 every time the overlay re-opens (e.g. from "Show workspace
  // tour" in Settings).
  useEffect(() => {
    if (visible) {
      setStep(0);
      // RN renders the Modal asynchronously — defer the scroll reset until the
      // ScrollView has remounted, otherwise scrollTo({ x: 0 }) has nothing to
      // scroll yet.
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: 0, animated: false });
      });
    }
  }, [visible]);

  const onMomentumScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / cardWidth);
    if (idx !== step && idx >= 0 && idx < STEPS.length) {
      setStep(idx);
      lightHaptic();
    }
  };

  const goToStep = (idx: number) => {
    if (idx < 0 || idx >= STEPS.length) return;
    lightHaptic();
    scrollRef.current?.scrollTo({ x: idx * cardWidth, animated: true });
    setStep(idx);
  };

  const isLast = step === STEPS.length - 1;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View className="flex-1 bg-black/85 items-center justify-center px-4">
        <View
          className="bg-surface rounded-3xl border border-border overflow-hidden"
          style={{ width: cardWidth }}
        >
          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumScrollEnd}
            // pagingEnabled wants the page to be exactly the ScrollView's width.
            // We size each child to cardWidth so paging snaps reliably.
            style={{ width: cardWidth }}
          >
            {STEPS.map((s, idx) => (
              <View
                key={idx}
                style={{ width: cardWidth }}
                className="px-6 py-8 items-center"
              >
                <View className="h-32 items-center justify-center mb-4">
                  {s.hero(uiScale)}
                </View>
                <Text className="text-zinc-100 text-xl font-bold text-center mb-3">
                  {s.title}
                </Text>
                <Text className="text-zinc-400 text-sm leading-5 text-center">
                  {s.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Pagination dots */}
          <View className="flex-row justify-center items-center gap-2 pb-4">
            {STEPS.map((_, idx) => {
              const active = idx === step;
              return (
                <Pressable
                  key={idx}
                  onPress={() => goToStep(idx)}
                  hitSlop={8}
                  className={`rounded-full ${
                    active ? "bg-primary w-6 h-2" : "bg-zinc-700 w-2 h-2"
                  }`}
                />
              );
            })}
          </View>

          <View className="flex-row gap-3 px-5 pb-5">
            {isLast ? (
              <Button
                label="Got it"
                onPress={onDismiss}
                className="flex-1"
              />
            ) : (
              <>
                <Button
                  label="Skip"
                  variant="ghost"
                  onPress={onDismiss}
                  className="flex-1"
                />
                <Button
                  label="Next"
                  onPress={() => goToStep(step + 1)}
                  className="flex-1"
                />
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// --- Step heroes ---
// Each hero is a small abstract illustration built from existing primitives so
// the tutorial doesn't ship any new image assets.

function StackedCardsHero({ uiScale }: { uiScale: number }) {
  // Two offset dashboard cards behind a third primary one. The offsets are
  // multiplied by uiScale so the stack reads at higher accessibility scales.
  const off = 6 * uiScale;
  return (
    <View className="relative w-24 h-24 items-center justify-center">
      <View
        className="absolute w-20 h-20 rounded-2xl bg-zinc-800 border border-zinc-700"
        style={{ transform: [{ translateX: off * 2 }, { translateY: -off }] }}
      />
      <View
        className="absolute w-20 h-20 rounded-2xl bg-zinc-700 border border-zinc-600"
        style={{ transform: [{ translateX: off }, { translateY: off / 2 }] }}
      />
      <View className="w-20 h-20 rounded-2xl bg-primary/20 border border-primary items-center justify-center">
        <Icon icon={LayoutDashboard} size={28} color="#60a5fa" />
      </View>
    </View>
  );
}

function SwitchAndCustomizeHero() {
  return (
    <View className="flex-row items-center gap-3">
      <View className="flex-row items-center gap-1.5 bg-surface-light rounded-xl px-3 py-2 border border-border">
        <Icon icon={Layers} size={16} color="#60a5fa" />
        <Text className="text-zinc-100 text-base font-semibold">Home</Text>
        <Icon icon={ChevronsUpDown} size={14} color="#71717a" />
      </View>
      <View className="bg-surface-light rounded-xl p-2 border border-border">
        <Icon icon={SlidersHorizontal} size={18} color="#a1a1aa" />
      </View>
    </View>
  );
}

function TabBarHero() {
  // Mini bottom-bar mockup. The active slot is highlighted to mirror the real
  // tab bar's accent color treatment.
  const tabs: ReadonlyArray<{ icon: LucideIcon; active?: boolean }> = [
    { icon: LayoutDashboard, active: true },
    { icon: Download },
    { icon: Film },
    { icon: Tv },
    { icon: CalendarDays },
  ];
  return (
    <View className="flex-row items-center gap-4 bg-surface-light rounded-2xl px-4 py-3 border border-border">
      {tabs.map((t, idx) => (
        <Icon
          key={idx}
          icon={t.icon}
          size={20}
          color={t.active ? "#60a5fa" : "#71717a"}
        />
      ))}
    </View>
  );
}
