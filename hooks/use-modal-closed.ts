import { useCallback, useEffect, useRef } from "react";
import { Platform } from "react-native";

/**
 * Fire `onClosed` exactly once after a `<Modal>` is fully gone — robustly across
 * platforms and React Native versions.
 *
 * Why this exists: on iOS you must not present (or unmount the screen behind) a
 * second view controller while a modal is still dismissing — it hangs the JS
 * thread on the New Architecture. See react-native#10727 and #50152 ("invisible
 * layer blocks UI when rapidly opening and closing modals"). The safe signal is
 * the modal's `onDismiss`, but that callback has a long history of not firing on
 * some iOS versions (react-native#29455, #47694) and Android never fires it.
 *
 * So we treat `onDismiss` as the fast path on iOS and back it with a timer armed
 * on the open→closed transition (this also drives Android). Whichever lands
 * first wins; a once-guard makes the other a no-op. The backstop delay sits
 * safely past the dismiss animation, so `onClosed` never fires while the modal
 * is still on screen.
 *
 * @param isOpen      whether the native modal is currently presented
 * @param onClosed    called once after it is fully dismissed
 * @param fallbackMs  backstop delay after `isOpen`→false (default 500ms)
 * @returns the `onDismiss` handler to attach to the `<Modal>` (undefined on Android)
 */
export function useModalClosed(
  isOpen: boolean,
  onClosed?: () => void,
  fallbackMs = 500,
) {
  const cbRef = useRef(onClosed);
  cbRef.current = onClosed;
  const fired = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(isOpen);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const fire = useCallback(() => {
    if (fired.current) return;
    fired.current = true;
    clear();
    cbRef.current?.();
  }, []);

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      // Reopened — reset for the next close cycle.
      fired.current = false;
      clear();
    } else if (!isOpen && wasOpen.current) {
      // Started closing — arm the backstop in case onDismiss never lands.
      clear();
      timer.current = setTimeout(fire, fallbackMs);
    }
    wasOpen.current = isOpen;
  }, [isOpen, fire, fallbackMs]);

  // Clean up any pending timer on unmount.
  useEffect(() => clear, []);

  return Platform.OS === "ios" ? fire : undefined;
}
