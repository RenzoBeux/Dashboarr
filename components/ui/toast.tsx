import { useEffect, useRef, useCallback, useState } from "react";
import { Animated, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, AlertTriangle, X, Info, Copy, Check } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Icon } from "@/components/ui/icon";
import { create } from "zustand";
import { successHaptic, errorHaptic, brrrHaptic } from "@/lib/haptics";
import { formatErrorForCopy, getHttpErrorMessage } from "@/lib/http-client";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  // What the in-toast Copy button puts on the clipboard. When omitted the
  // visible `message` is copied. Errors set this to the full HTTP body / stack
  // so users can share the real failure, not the friendly summary.
  copyText?: string;
}

interface ToastStore {
  toasts: Toast[];
  nextId: number;
  addToast: (message: string, type?: ToastType, copyText?: string) => void;
  removeToast: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  nextId: 1,
  addToast: (message, type = "success", copyText) =>
    set((state) => ({
      toasts: [...state.toasts, { id: state.nextId, message, type, copyText }],
      nextId: state.nextId + 1,
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function toast(
  message: string,
  type: ToastType = "success",
  copyText?: string,
) {
  useToastStore.getState().addToast(message, type, copyText);
  if (type === "success") successHaptic();
  else if (type === "error") errorHaptic();
}

// Display an error toast with the best-available message AND wire the Copy
// button to the verbose, debuggable error. Prefer this over `toast(msg,"error")`
// whenever the caller has the original error in scope.
//   - Display: server's `{ message }` body → err.message → fallback string
//   - Copy:    HTTP status + URL + body, or Error.name/message/stack
export function toastError(fallback: string, err?: unknown) {
  const serverMsg = err ? getHttpErrorMessage(err) : undefined;
  const errorMsg =
    err instanceof Error && err.message ? err.message : undefined;
  const message = serverMsg ?? errorMsg ?? fallback;
  const copyText = err !== undefined ? formatErrorForCopy(err) : undefined;
  toast(message, "error", copyText);
}

const ICON_MAP: Record<ToastType, React.ComponentType<any>> = {
  success: CheckCircle,
  error: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<ToastType, string> = {
  success: "#22c55e",
  error: "#ef4444",
  info: "#3b82f6",
};

const BG_MAP: Record<ToastType, string> = {
  success: "bg-green-950",
  error: "bg-red-950",
  info: "bg-blue-950",
};

// Errors get more dwell time + lines because users often want to read the full
// server message and (optionally) copy it. Success/info stay snappy.
const DISMISS_MS: Record<ToastType, number> = {
  success: 3000,
  info: 3000,
  error: 6000,
};

const LINE_CLAMP: Record<ToastType, number> = {
  success: 2,
  info: 2,
  error: 4,
};

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDismiss());
  }, [onDismiss, translateY, opacity]);

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 12,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    dismissTimerRef.current = setTimeout(() => {
      dismiss();
    }, DISMISS_MS[t.type]);

    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = useCallback(async () => {
    // Prefer the verbose copyText (HTTP body, stack, etc.) when set. Falls
    // back to the visible message for callers that didn't pass a richer
    // payload — better than nothing.
    await Clipboard.setStringAsync(t.copyText ?? t.message);
    brrrHaptic();
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
    // Give the user extra time to verify the copy before auto-dismiss.
    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
    dismissTimerRef.current = setTimeout(dismiss, 4000);
  }, [t.copyText, t.message, dismiss]);

  const ToastIcon = ICON_MAP[t.type];
  const canCopy = t.type === "error";

  return (
    <Animated.View
      style={{ transform: [{ translateY }], opacity }}
      className={`mx-4 mb-2 rounded-xl px-4 py-3 flex-row items-center gap-3 border border-border/50 ${BG_MAP[t.type]}`}
    >
      <Icon icon={ToastIcon} size={18} color={COLOR_MAP[t.type]} />
      <Text className="text-zinc-200 text-sm flex-1" numberOfLines={LINE_CLAMP[t.type]}>
        {t.message}
      </Text>
      {canCopy ? (
        <Pressable
          onPress={handleCopy}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={copied ? "Copied" : "Copy error message"}
          className="active:opacity-60"
        >
          <Icon
            icon={copied ? Check : Copy}
            size={16}
            color={copied ? "#4ade80" : "#a1a1aa"}
          />
        </Pressable>
      ) : null}
      <Pressable onPress={dismiss} hitSlop={8} accessibilityLabel="Dismiss">
        <Icon icon={X} size={16} color="#71717a" />
      </Pressable>
    </Animated.View>
  );
}

export function ToastContainer() {
  const insets = useSafeAreaInsets();
  const toasts = useToastStore((s) => s.toasts);
  const removeToast = useToastStore((s) => s.removeToast);

  if (toasts.length === 0) return null;

  return (
    <View
      style={{ top: insets.top + 8 }}
      className="absolute left-0 right-0 z-50"
      pointerEvents="box-none"
    >
      {toasts.slice(-3).map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={() => removeToast(t.id)} />
      ))}
    </View>
  );
}
