import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { lightHaptic, mediumHaptic } from "@/lib/haptics";
import type { ServiceId } from "@/lib/constants";

// Long-press window before the row pops into drag mode. Shorter than the
// platform default so the gesture feels responsive, but long enough that a
// quick tap on a child Pressable (the existing arrow buttons) still resolves
// as a tap and never accidentally activates drag.
const ACTIVATE_AFTER_MS = 250;

// Spring for the active row's settle on release. Tuned to match the spring
// used on the arrow-button path elsewhere so the two interactions feel of one
// piece.
const SPRING = { damping: 18, stiffness: 220, mass: 0.7 } as const;

// Layout transition used by *non-active* rows so they slide smoothly to their
// new flex slots whenever the array reorders mid-drag. The active row gets
// `layout={undefined}` so its JSX position can snap (the visible position is
// already kept continuous by the translateY compensation in animatedStyle).
const ROW_LAYOUT = LinearTransition.springify().damping(18).stiffness(220).mass(0.7);

interface DraggableKindListProps {
  items: ServiceId[];
  onReorder: (next: ServiceId[]) => void;
  renderItem: (id: ServiceId) => ReactNode;
  // Gap between rows (px). Used to compute the swap-stride along with the
  // measured row height, so the math agrees with the visual spacing.
  gap?: number;
}

export function DraggableKindList({
  items,
  onReorder,
  renderItem,
  gap = 20,
}: DraggableKindListProps) {
  // First measured row height (incl. gap) — used as the swap stride. Rows in
  // this list have similar heights, so a single stride is accurate enough and
  // keeps the per-frame math cheap. Captured once and never updated mid-drag
  // (re-measuring would shift swap thresholds out from under the user's
  // finger when the instance picker mounts/unmounts inside a row).
  const stride = useSharedValue(0);
  const strideMeasured = useRef(false);

  // Drag state, all kept on the UI thread so the per-frame animatedStyle math
  // is cheap. `activeId` is the row currently being dragged; `dragStartIndex`
  // is its index at drag start (constant during the gesture); `dragCurrentIndex`
  // is its index in the *live-mutated* local list — updated via a
  // useLayoutEffect AFTER React commits the reorder, so it stays in sync with
  // the actually-rendered flex slot. `dragRequestedTarget` is what we've most
  // recently asked the parent to reorder to; it dedupes rapid-fire onUpdates
  // so we don't keep re-asking for the same target every frame. `translationY`
  // is the cumulative pan offset.
  const activeId = useSharedValue<string | null>(null);
  const dragStartIndex = useSharedValue(-1);
  const dragCurrentIndex = useSharedValue(-1);
  const dragRequestedTarget = useSharedValue(-1);
  const translationY = useSharedValue(0);

  // Mirror of activeId on the JS thread, used to selectively disable the
  // layout transition for the active row (LinearTransition would interfere
  // with the translateY compensation when the row's flex slot changes
  // mid-drag — see the comment near ROW_LAYOUT above).
  const [activeIdState, setActiveIdState] = useState<ServiceId | null>(null);

  // Local copy of the order — we mutate this live during a drag (as the user
  // crosses row boundaries) and only commit the result to the parent's
  // onReorder on release. That gives non-active rows real flex slot changes
  // to animate (via ROW_LAYOUT) without hammering the store on every frame.
  const [localItems, setLocalItems] = useState<ServiceId[]>(items);
  const localItemsRef = useRef(localItems);
  localItemsRef.current = localItems;

  // Mirror activeIdState into a ref so setState updaters (which run before
  // the next render exposes the new value) can read the most recent value.
  const activeIdStateRef = useRef<ServiceId | null>(null);
  activeIdStateRef.current = activeIdState;

  // Pick up external changes to `items` when no drag is in progress. Skipping
  // this sync during a drag keeps the user's in-flight reorder from being
  // clobbered if the parent re-renders for any other reason.
  useEffect(() => {
    if (activeIdState === null) {
      setLocalItems(items);
    }
  }, [items, activeIdState]);

  // After every React commit, snap dragCurrentIndex on the UI thread to where
  // the active row actually lives in the rendered list. Doing this in
  // useLayoutEffect (synchronously between commit and paint) means the
  // animatedStyle worklet's `delta = current - start` reads a value
  // consistent with the new flex slot, so the active row's transform
  // compensates for the slot change in the same frame and stays pinned under
  // the finger.
  useLayoutEffect(() => {
    if (activeIdState === null) {
      dragCurrentIndex.value = -1;
      return;
    }
    const newIdx = localItems.indexOf(activeIdState);
    if (newIdx !== -1) {
      dragCurrentIndex.value = newIdx;
    }
    // dragCurrentIndex is a sharedValue with stable identity — intentionally
    // excluded from the dep array. Re-runs are driven by the order/active
    // changes that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localItems, activeIdState]);

  const liveReorderTo = (target: number) => {
    setLocalItems((prev) => {
      // Re-resolve `from` from the latest prev to handle rapid-fire requests
      // safely (a second request arriving before the first has been
      // committed would otherwise carry a stale `from`).
      const currentId = activeIdStateRef.current;
      if (currentId === null) return prev;
      const from = prev.indexOf(currentId);
      if (from === -1) return prev;
      if (target < 0 || target >= prev.length) return prev;
      if (from === target) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const commitToParent = () => {
    const finalOrder = localItemsRef.current;
    const same =
      finalOrder.length === items.length &&
      finalOrder.every((v, i) => v === items[i]);
    if (!same) {
      onReorder(finalOrder);
      lightHaptic();
    }
  };

  return (
    <View style={{ gap }}>
      {localItems.map((id, index) => (
        <DraggableRow
          key={id}
          id={id}
          index={index}
          itemCount={localItems.length}
          isActive={activeIdState === id}
          activeId={activeId}
          dragStartIndex={dragStartIndex}
          dragCurrentIndex={dragCurrentIndex}
          dragRequestedTarget={dragRequestedTarget}
          translationY={translationY}
          stride={stride}
          onMeasure={(h) => {
            if (strideMeasured.current) return;
            if (h <= 0) return;
            stride.value = h + gap;
            strideMeasured.current = true;
          }}
          onActivate={() => {
            setActiveIdState(id);
            mediumHaptic();
          }}
          onSettled={() => {
            // Commit to the parent FIRST and clear active state in the same
            // microtask so React batches both into one render — that way the
            // sync useEffect never sees "active cleared, parent still stale"
            // and won't briefly revert localItems to the pre-drag order.
            commitToParent();
            setActiveIdState(null);
          }}
          onReorderRequest={liveReorderTo}
        >
          {renderItem(id)}
        </DraggableRow>
      ))}
    </View>
  );
}

interface DraggableRowProps {
  id: ServiceId;
  index: number;
  itemCount: number;
  isActive: boolean;
  activeId: ReturnType<typeof useSharedValue<string | null>>;
  dragStartIndex: ReturnType<typeof useSharedValue<number>>;
  dragCurrentIndex: ReturnType<typeof useSharedValue<number>>;
  dragRequestedTarget: ReturnType<typeof useSharedValue<number>>;
  translationY: ReturnType<typeof useSharedValue<number>>;
  stride: ReturnType<typeof useSharedValue<number>>;
  onMeasure: (height: number) => void;
  onActivate: () => void;
  onSettled: () => void;
  onReorderRequest: (target: number) => void;
  children: ReactNode;
}

function DraggableRow({
  id,
  index,
  itemCount,
  isActive,
  activeId,
  dragStartIndex,
  dragCurrentIndex,
  dragRequestedTarget,
  translationY,
  stride,
  onMeasure,
  onActivate,
  onSettled,
  onReorderRequest,
  children,
}: DraggableRowProps) {
  const gesture = Gesture.Pan()
    .activateAfterLongPress(ACTIVATE_AFTER_MS)
    .onStart(() => {
      cancelAnimation(translationY);
      activeId.value = id;
      dragStartIndex.value = index;
      dragCurrentIndex.value = index;
      dragRequestedTarget.value = index;
      translationY.value = 0;
      runOnJS(onActivate)();
    })
    .onUpdate((e) => {
      translationY.value = e.translationY;
      const s = stride.value;
      if (s <= 0) return;
      // Target index = "where the user's finger would put this row if we
      // dropped right now". Clamped to the array bounds.
      const target = Math.min(
        Math.max(dragStartIndex.value + Math.round(e.translationY / s), 0),
        itemCount - 1,
      );
      // dragRequestedTarget dedupes rapid-fire requests so we don't keep
      // asking the parent to reorder to the same slot every frame. The
      // parent will update React state which propagates through
      // useLayoutEffect → dragCurrentIndex; we deliberately do NOT touch
      // dragCurrentIndex here so the animatedStyle's `delta` stays in sync
      // with the actually-rendered flex slot, eliminating the 1-frame
      // visual jump that would happen if we updated it eagerly on UI.
      if (target !== dragRequestedTarget.value) {
        dragRequestedTarget.value = target;
        runOnJS(onReorderRequest)(target);
      }
    })
    .onEnd(() => {
      const s = stride.value > 0 ? stride.value : 1;
      const delta = dragCurrentIndex.value - dragStartIndex.value;
      // Spring translationY toward `delta * s` — that's the value at which the
      // active row's transform offset (= translationY - delta * s) equals 0,
      // so the row settles at its new natural slot. Clearing activeId only
      // in the spring's completion callback keeps the row honoring its
      // transform throughout the settle (without this the row jumps to 0
      // transform the instant the gesture ends).
      translationY.value = withSpring(delta * s, SPRING, (finished) => {
        if (finished) {
          activeId.value = null;
          dragStartIndex.value = -1;
          dragRequestedTarget.value = -1;
          translationY.value = 0;
          // dragCurrentIndex is cleared by the parent's useLayoutEffect when
          // activeIdState flips to null. Don't touch it here so the
          // animatedStyle keeps a valid delta until then.
          runOnJS(onSettled)();
        }
      });
    })
    .onFinalize((_e, success) => {
      // Gesture was cancelled (e.g. another gesture won the touch). Snap state
      // back so the row doesn't get stuck mid-drag. The local list still has
      // any live reorders the user performed before cancel — committing them
      // matches what they actually saw on screen.
      if (!success && activeId.value === id) {
        activeId.value = null;
        dragStartIndex.value = -1;
        dragRequestedTarget.value = -1;
        translationY.value = withSpring(0, SPRING);
        runOnJS(onSettled)();
      }
    });

  const animatedStyle = useAnimatedStyle(() => {
    if (activeId.value === id) {
      // Visual offset = finger translation - the natural-slot displacement
      // already absorbed by live reorders. This keeps the row pinned under
      // the finger regardless of how many slot boundaries the user has
      // crossed.
      const delta = dragCurrentIndex.value - dragStartIndex.value;
      const offset = translationY.value - delta * stride.value;
      return {
        transform: [{ translateY: offset }, { scale: 1.03 }],
        zIndex: 100,
        elevation: 8,
        opacity: 0.96,
      };
    }
    return {
      transform: [{ translateY: 0 }, { scale: 1 }],
      zIndex: 1,
      elevation: 0,
      opacity: 1,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        // The active row gets no layout transition: its JSX slot can change
        // mid-drag (because liveReorder mutates the array), and the
        // translateY math above already keeps it visually continuous. Non-
        // active rows DO animate their layout so the user sees them slide
        // out of the way as the dragged row crosses slot boundaries.
        layout={isActive ? undefined : ROW_LAYOUT}
        style={animatedStyle}
        onLayout={(e) => onMeasure(e.nativeEvent.layout.height)}
      >
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
