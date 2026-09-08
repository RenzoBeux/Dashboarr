import { useCallback, useEffect, useRef } from "react";
import { useNavigation } from "expo-router";
import { usePreventRemove, type NavigationAction } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import { useModalFlow } from "@/hooks/use-modal-flow";

/**
 * Unsaved-changes guard for screens that keep edits in local state until
 * Save (mirrors app/dashboard-edit/[id].tsx). While `dirty`, any removal of
 * the screen is intercepted and a "Discard changes?" confirm is opened: the
 * Android hardware back, the iOS swipe back and, now that screens live in
 * per-tab stacks (#330), the tab re-tap that pops the stack to its root.
 *
 * `onLeave` is what the header back arrow does when there is nothing to
 * keep, or once the user confirms discarding: `router.back()` for a pushed
 * screen, or a "back to the list" state change for an in-screen form.
 *
 * Usage: `<BackHeader onBack={guard.leave} />` and
 * `<ConfirmModal {...guard.discardModalProps} onConfirm={guard.confirmDiscard} ... />`
 * (the modal must be mounted whenever `dirty` can be true).
 */
export function useUnsavedChangesGuard(dirty: boolean, onLeave: () => void) {
  const navigation = useNavigation();
  // Set right before a removal we already confirmed, so the intercepted
  // action can be replayed once instead of prompting again.
  const allowRemoveRef = useRef(false);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  // The prevented navigation action rides as the step payload; null means the
  // header back (onLeave).
  const flow = useModalFlow<{ discard: NavigationAction | null }>();

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

  // An in-screen onLeave (form -> list) removes nothing, so the flag would
  // otherwise survive and skip the next prompt; it is stale once clean.
  useEffect(() => {
    if (!dirty) allowRemoveRef.current = false;
  }, [dirty]);

  const performDiscard = () => {
    const action = flow.payload("discard");
    allowRemoveRef.current = true;
    if (action) navigation.dispatch(action);
    else onLeaveRef.current();
  };

  /** ConfirmModal `onConfirm`: leaves once the confirm has fully closed. */
  const confirmDiscard = () => {
    flow.close();
    flow.whenClear(performDiscard);
  };

  /** Header back: asks first when dirty, otherwise leaves right away. */
  const leave = () => {
    if (dirty) {
      Haptics.selectionAsync();
      flow.open("discard", null);
      return;
    }
    onLeaveRef.current();
  };

  return { leave, confirmDiscard, discardModalProps: flow.bind("discard") };
}
