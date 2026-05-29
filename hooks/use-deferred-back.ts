import { useCallback, useRef } from "react";
import { Platform } from "react-native";
import { useRouter } from "expo-router";

/**
 * Safely navigate back after a confirm dialog (a `<Modal>`) closes.
 *
 * On iOS, calling `router.back()` — which unmounts the current native screen —
 * while a `<Modal>` is still running its dismiss animation hangs the JS thread
 * on the New Architecture (Fabric). iOS will not present/dismiss one
 * UIViewController while another is mid-transition, so the only reliable moment
 * to pop the screen is *after* the modal reports it is fully dismissed (its
 * `onDismiss`). See react-native#10727, react-native#48611 and
 * react-native-screens#3648.
 *
 * Usage:
 *   const back = useDeferredBack();
 *   // on confirm:
 *   back.arm();                 // mark that a pop is coming once the modal closes
 *   setPendingDelete(null);     // start closing the confirm modal
 *   mutation.mutate(args, { onSuccess: () => back.back() });
 *   // on the modal:
 *   <ConfirmModal ... onClosed={back.onClosed} />
 *
 * Android has no such constraint, so `back()` pops immediately there and the
 * modal/screen teardown overlap is harmless.
 */
export function useDeferredBack() {
  const router = useRouter();
  const modalClosed = useRef(true);
  const wantBack = useRef(false);

  // Call right before starting to close the modal that a back() will follow.
  const arm = useCallback(() => {
    if (Platform.OS !== "ios") return;
    modalClosed.current = false;
    wantBack.current = false;
  }, []);

  // Wire to the modal's onClosed. Pops now if a back() was already requested.
  const onClosed = useCallback(() => {
    modalClosed.current = true;
    if (wantBack.current) {
      wantBack.current = false;
      router.back();
    }
  }, [router]);

  // Request the pop (e.g. from a mutation's onSuccess). Defers until the modal
  // is fully dismissed on iOS; immediate on Android.
  const back = useCallback(() => {
    if (Platform.OS !== "ios") {
      router.back();
      return;
    }
    if (modalClosed.current) {
      router.back();
    } else {
      wantBack.current = true;
    }
  }, [router]);

  return { arm, onClosed, back };
}
