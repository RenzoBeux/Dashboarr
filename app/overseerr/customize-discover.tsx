import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  Modal,
  KeyboardAvoidingView,
  TextInput,
  Switch,
} from "react-native";
import Animated, { useAnimatedRef } from "react-native-reanimated";
import { useNavigation, useRouter } from "expo-router";
import { usePreventRemove } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
import { Pencil, Trash2, Plus, RotateCcw, GripVertical } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import {
  ScreenWrapper,
  useScreenBottomPadding,
} from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ErrorBanner } from "@/components/common/error-banner";
import { Button } from "@/components/ui/button";
import { toast, toastError } from "@/components/ui/toast";
import Sortable, {
  type SortableGridRenderItem,
  type SortableGridDragEndParams,
} from "react-native-sortables";
import {
  AddSliderSheet,
  type NewSliderPayload,
} from "@/components/overseerr/add-slider-sheet";
import {
  useOverseerrDiscoverSliders,
  useSaveDiscoverSliders,
  useDeleteDiscoverSlider,
  useResetDiscoverSliders,
} from "@/hooks/use-overseerr";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { BUILTIN_SLIDER_LABELS } from "@/lib/overseerr-discover";
import {
  DiscoverSliderType,
  type DiscoverSlider,
  type DiscoverSliderInput,
  type DiscoverSliderTypeValue,
} from "@/lib/types";

// Local editable copy of a slider. `id` is null for sliders the user added but
// hasn't saved yet (the bulk POST creates them server-side). `rowKey` is a
// stable key for the drag list, independent of the (possibly absent) server id.
interface DraftSlider {
  rowKey: string;
  id: number | null;
  type: DiscoverSliderTypeValue;
  isBuiltIn: boolean;
  enabled: boolean;
  title: string | null;
  data: string | null;
}

const CUSTOM_TYPE_LABELS: Partial<Record<DiscoverSliderTypeValue, string>> = {
  [DiscoverSliderType.TMDB_MOVIE_GENRE]: "Movie genre",
  [DiscoverSliderType.TMDB_TV_GENRE]: "TV genre",
  [DiscoverSliderType.TMDB_STUDIO]: "Studio",
  [DiscoverSliderType.TMDB_NETWORK]: "Network",
  [DiscoverSliderType.TMDB_MOVIE_KEYWORD]: "Movie keyword",
  [DiscoverSliderType.TMDB_TV_KEYWORD]: "TV keyword",
  [DiscoverSliderType.TMDB_SEARCH]: "Search",
  [DiscoverSliderType.TMDB_MOVIE_STREAMING_SERVICES]: "Movie streaming",
  [DiscoverSliderType.TMDB_TV_STREAMING_SERVICES]: "TV streaming",
};

function sliderLabel(d: DraftSlider): string {
  if (d.isBuiltIn) return BUILTIN_SLIDER_LABELS[d.type] ?? `Section ${d.type}`;
  return d.title?.trim() || "Untitled section";
}

function sliderSubtitle(d: DraftSlider): string {
  if (d.isBuiltIn) return "Built-in";
  return CUSTOM_TYPE_LABELS[d.type] ?? "Custom";
}

// Compact signature of the editable fields, in order — used to detect "dirty"
// (reorder, enable/disable, rename, add, delete all change it).
function signature(draft: DraftSlider[]): string {
  return draft
    .map(
      (d) =>
        `${d.id ?? "new"}:${d.enabled ? 1 : 0}:${d.title ?? ""}:${d.data ?? ""}:${d.type}`,
    )
    .join("|");
}

export default function CustomizeDiscoverScreen() {
  const router = useRouter();
  const navigation = useNavigation();
  const { data: sliders, isLoading, isError, error } = useOverseerrDiscoverSliders();
  const saveSliders = useSaveDiscoverSliders();
  const deleteSlider = useDeleteDiscoverSlider();
  const resetSliders = useResetDiscoverSliders();

  const [draft, setDraft] = useState<DraftSlider[]>([]);
  // Latest draft for stable callbacks/renderItem to read without changing
  // identity — keeps memoized rows from re-rendering on every drag slot-cross.
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const initialSigRef = useRef("");
  const seededRef = useRef(false);
  const newKeyCounter = useRef(0);
  // Server ids of saved custom sliders the user removed — DELETEd on Save.
  const deletedIdsRef = useRef<number[]>([]);
  const paddingBottom = useScreenBottomPadding();
  // Animated ref handed to Sortable.Grid (as scrollableRef) so it can
  // auto-scroll this view when a dragged row reaches the top/bottom edge — the
  // list overflows once there are enough sections.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  const seedFrom = useCallback((list: DiscoverSlider[]) => {
    const rows: DraftSlider[] = [...list]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        rowKey: `srv-${s.id}`,
        id: s.id,
        type: s.type,
        isBuiltIn: s.isBuiltIn,
        enabled: s.enabled,
        title: s.title,
        data: s.data,
      }));
    setDraft(rows);
    initialSigRef.current = signature(rows);
    deletedIdsRef.current = [];
    seededRef.current = true;
  }, []);

  // Seed the draft once on first load, and again after a reset re-fetches the
  // defaults (reset flips seededRef back to false).
  useEffect(() => {
    if (!sliders || seededRef.current) return;
    seedFrom(sliders);
  }, [sliders, seedFrom]);

  const dirty = useMemo(
    () => signature(draft) !== initialSigRef.current,
    [draft],
  );

  // --- Discard / navigation guard (mirrors app/dashboard-edit/[id].tsx) ---
  const allowRemoveRef = useRef(false);
  // The prevented navigation action rides as the step payload; null means the
  // header back (plain router.back()).
  const flow = useModalFlow<{
    discard: Parameters<typeof navigation.dispatch>[0] | null;
  }>();

  usePreventRemove(
    dirty,
    useCallback(
      ({ data }) => {
        if (allowRemoveRef.current) {
          allowRemoveRef.current = false;
          navigation.dispatch(data.action);
          return;
        }
        Haptics.selectionAsync();
        flow.open("discard", data.action);
      },
      [navigation, flow],
    ),
  );

  function performDiscard() {
    const action = flow.payload("discard");
    allowRemoveRef.current = true;
    if (action) navigation.dispatch(action);
    else router.back();
  }

  function confirmDiscard() {
    flow.close();
    flow.whenClear(performDiscard);
  }

  function handleCancel() {
    if (dirty) {
      Haptics.selectionAsync();
      flow.open("discard", null);
      return;
    }
    allowRemoveRef.current = true;
    router.back();
  }

  // --- Row actions (all local until Save) ---
  // react-native-sortables hands back the already-reordered array on drop, so
  // we just commit it straight to the draft.
  const handleDragEnd = useCallback(
    ({ data }: SortableGridDragEndParams<DraftSlider>) => {
      setDraft(data);
    },
    [],
  );

  const toggleEnabled = useCallback((rowKey: string, val: boolean) => {
    setDraft((prev) =>
      prev.map((d) => (d.rowKey === rowKey ? { ...d, enabled: val } : d)),
    );
  }, []);

  const handleAdd = useCallback((payload: NewSliderPayload) => {
    newKeyCounter.current += 1;
    setDraft((prev) => [
      ...prev,
      {
        rowKey: `new-${newKeyCounter.current}`,
        id: null,
        type: payload.type,
        isBuiltIn: false,
        enabled: true,
        title: payload.title,
        data: payload.data,
      },
    ]);
    toast(`Added "${payload.title}"`, "success");
  }, []);

  // --- Rename (custom only) ---
  const [pendingRename, setPendingRename] = useState<DraftSlider | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const openRename = useCallback((rowKey: string) => {
    const d = draftRef.current.find((x) => x.rowKey === rowKey);
    if (!d) return;
    setRenameDraft(d.title ?? "");
    setPendingRename(d);
  }, []);

  function commitRename() {
    if (!pendingRename) return;
    const trimmed = renameDraft.trim();
    if (trimmed.length === 0) return;
    const target = pendingRename;
    setDraft((prev) =>
      prev.map((d) =>
        d.rowKey === target.rowKey ? { ...d, title: trimmed } : d,
      ),
    );
    setPendingRename(null);
  }

  // --- Delete (custom only) ---
  const [pendingDelete, setPendingDelete] = useState<DraftSlider | null>(null);

  const requestDelete = useCallback((rowKey: string) => {
    const d = draftRef.current.find((x) => x.rowKey === rowKey);
    if (d) setPendingDelete(d);
  }, []);

  function confirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    if (target.id != null) deletedIdsRef.current.push(target.id);
    setDraft((prev) => prev.filter((d) => d.rowKey !== target.rowKey));
  }

  // --- Reset to defaults ---
  const [resetOpen, setResetOpen] = useState(false);

  function confirmReset() {
    setResetOpen(false);
    resetSliders.mutate(undefined, {
      onSuccess: () => {
        // Allow the seeding effect to re-run against the refetched defaults.
        seededRef.current = false;
        deletedIdsRef.current = [];
        toast("Reset to defaults", "success");
      },
      onError: (e) => toastError("Couldn't reset Discover", e),
    });
  }

  // --- Add sheet ---
  const [addOpen, setAddOpen] = useState(false);

  // --- Save ---
  const isSaving = saveSliders.isPending || deleteSlider.isPending;

  async function handleSave() {
    try {
      for (const id of deletedIdsRef.current) {
        await deleteSlider.mutateAsync(id);
      }
      deletedIdsRef.current = [];
      // Order is carried by array position. Built-in sliders only accept
      // enabled changes; send null title/data for them. New rows (id null) go
      // as id 0 so the server creates them (it upserts: existing id → update,
      // else → create).
      const payload: DiscoverSliderInput[] = draft.map((d) => ({
        id: d.id ?? 0,
        type: d.type,
        enabled: d.enabled,
        title: d.isBuiltIn ? null : d.title,
        data: d.isBuiltIn ? null : d.data,
      }));
      await saveSliders.mutateAsync(payload);
      toast("Discover updated", "success");
      allowRemoveRef.current = true;
      router.back();
    } catch (e) {
      toastError("Couldn't save Discover sections", e);
    }
  }

  // Memoized rows only update when their own slider object changes; the grid
  // owns drag re-renders. Callbacks are stable and keyed by rowKey.
  const renderItem = useCallback<SortableGridRenderItem<DraftSlider>>(
    ({ item }) => (
      <SliderRow
        slider={item}
        onToggle={toggleEnabled}
        onRename={openRename}
        onDelete={requestDelete}
      />
    ),
    [toggleEnabled, openRename, requestDelete],
  );

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader
        title="Customize Discover"
        onBack={handleCancel}
        right={
          <Pressable
            onPress={handleSave}
            disabled={!dirty || isSaving}
            hitSlop={6}
            className="px-4 py-1.5 rounded-xl bg-primary active:opacity-70"
            style={{ opacity: dirty && !isSaving ? 1 : 0.4 }}
          >
            <Text className="text-white text-sm font-semibold">
              {isSaving ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        }
      />

      {isError ? (
        <View className="gap-3">
          <ErrorBanner error={error} title="Couldn't load Discover settings" />
          <Text className="text-zinc-500 text-sm">
            Customizing Discover needs a Seerr admin API key.
          </Text>
        </View>
      ) : isLoading && draft.length === 0 ? (
        <Text className="text-zinc-500 text-center py-8">Loading…</Text>
      ) : (
        // Animated.ScrollView (a plain RN ScrollView under reanimated's
        // wrapper) hosts the sortable list. The animated ref is passed to
        // Sortable.Grid as scrollableRef so the library auto-scrolls it while a
        // row is dragged to an edge. Only this region scrolls; the header stays
        // fixed.
        <Animated.ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom }}
          showsVerticalScrollIndicator={false}
        >
          <Text className="text-zinc-500 text-xs mb-3">
            Drag the grip handle to reorder. Toggle a section to show or hide it.
            Changes sync to Seerr when you Save.
          </Text>

          {draft.length > 0 && (
            <Sortable.Grid
              columns={1}
              data={draft}
              keyExtractor={(d) => d.rowKey}
              renderItem={renderItem}
              rowGap={10}
              scrollableRef={scrollRef}
              customHandle
              activeItemScale={1.04}
              activeItemShadowOpacity={0.2}
              onDragStart={() => mediumHaptic()}
              onOrderChange={() => lightHaptic()}
              onDragEnd={handleDragEnd}
            />
          )}

          <Pressable
            onPress={() => setAddOpen(true)}
            className="flex-row items-center justify-center gap-2 border border-dashed border-zinc-700 rounded-2xl py-4 mt-4 active:opacity-70"
          >
            <Icon icon={Plus} size={18} color="#a1a1aa" />
            <Text className="text-zinc-300 text-sm font-medium">Add section</Text>
          </Pressable>

          <Pressable
            onPress={() => setResetOpen(true)}
            className="flex-row items-center justify-center gap-2 py-4 mt-2 active:opacity-70"
          >
            <Icon icon={RotateCcw} size={16} color="#ef4444" />
            <Text className="text-danger text-sm font-medium">
              Reset to defaults
            </Text>
          </Pressable>
        </Animated.ScrollView>
      )}

      <AddSliderSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={handleAdd}
      />

      {/* Rename — short centered card, safe with KeyboardAvoidingView */}
      <Modal
        visible={!!pendingRename}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setPendingRename(null)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1 bg-black/70 items-center justify-center px-6"
        >
          <View className="w-full max-w-md rounded-2xl bg-surface border border-border p-5 gap-4">
            <Text className="text-zinc-100 text-lg font-semibold">
              Rename section
            </Text>
            <TextInput
              value={renameDraft}
              onChangeText={setRenameDraft}
              autoFocus
              placeholder="Section title"
              placeholderTextColor="#52525b"
              returnKeyType="done"
              onSubmitEditing={commitRename}
              className="bg-surface-light border border-border rounded-xl px-4 py-3 text-zinc-100 text-base"
            />
            <View className="flex-row gap-3 mt-1">
              <Button
                label="Cancel"
                variant="outline"
                onPress={() => setPendingRename(null)}
                className="flex-1"
              />
              <Button
                label="Save"
                variant="primary"
                onPress={commitRename}
                disabled={renameDraft.trim().length === 0}
                className="flex-1"
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmModal
        visible={!!pendingDelete}
        title="Delete section?"
        message={`"${pendingDelete ? sliderLabel(pendingDelete) : ""}" will be removed from Discover.`}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmModal
        visible={resetOpen}
        title="Reset Discover?"
        message="This restores Seerr's default sections, removes any custom sections, and discards unsaved changes."
        tone="danger"
        confirmLabel="Reset"
        onConfirm={confirmReset}
        onCancel={() => setResetOpen(false)}
      />

      <ConfirmModal
        {...flow.bind("discard")}
        title="Discard changes?"
        message="Your Discover edits haven't been saved yet."
        tone="danger"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={confirmDiscard}
      />
    </ScreenWrapper>
  );
}

// Memoized so a drag (which re-renders the list on each slot-cross) only
// re-renders the row whose slider object actually changed — not every row's
// native Switch and icons. Callbacks are stable and keyed by rowKey.
const SliderRow = memo(function SliderRow({
  slider,
  onToggle,
  onRename,
  onDelete,
}: {
  slider: DraftSlider;
  onToggle: (rowKey: string, value: boolean) => void;
  onRename: (rowKey: string) => void;
  onDelete: (rowKey: string) => void;
}) {
  const isCustom = !slider.isBuiltIn;
  return (
    <View
      className={`flex-row items-center gap-2 bg-surface-light rounded-2xl border border-border px-3 py-3 ${
        slider.enabled ? "" : "opacity-60"
      }`}
    >
      <Sortable.Handle>
        <View className="py-1 pr-1">
          <Icon icon={GripVertical} size={18} color="#52525b" />
        </View>
      </Sortable.Handle>
      <View className="flex-1">
        <Text className="text-zinc-100 text-base font-medium" numberOfLines={1}>
          {sliderLabel(slider)}
        </Text>
        <Text className="text-zinc-500 text-xs mt-0.5" numberOfLines={1}>
          {sliderSubtitle(slider)}
        </Text>
      </View>

      {isCustom && (
        <Pressable
          onPress={() => onRename(slider.rowKey)}
          hitSlop={8}
          className="p-1.5 active:opacity-70"
        >
          <Icon icon={Pencil} size={18} color="#a1a1aa" />
        </Pressable>
      )}
      {isCustom && (
        <Pressable
          onPress={() => onDelete(slider.rowKey)}
          hitSlop={8}
          className="p-1.5 active:opacity-70"
        >
          <Icon icon={Trash2} size={18} color="#ef4444" />
        </Pressable>
      )}

      <Switch
        value={slider.enabled}
        onValueChange={(v) => {
          Haptics.selectionAsync();
          onToggle(slider.rowKey, v);
        }}
        trackColor={{ false: "#3f3f46", true: "#3b82f6" }}
        thumbColor={slider.enabled ? "#ffffff" : "#a1a1aa"}
      />
    </View>
  );
});
