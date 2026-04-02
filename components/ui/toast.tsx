import { useEffect, useRef, useCallback } from "react";
import { Animated, Text, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle, AlertTriangle, X, Info } from "lucide-react-native";
import { create } from "zustand";
import { successHaptic, errorHaptic } from "@/lib/haptics";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastStore {
  toasts: Toast[];
  nextId: number;
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: number) => void;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  nextId: 1,
  addToast: (message, type = "success") =>
    set((state) => ({
      toasts: [...state.toasts, { id: state.nextId, message, type }],
      nextId: state.nextId + 1,
    })),
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export function toast(message: string, type: ToastType = "success") {
  useToastStore.getState().addToast(message, type);
  if (type === "success") successHaptic();
  else if (type === "error") errorHaptic();
}

const ICON_MAP: Record<ToastType, React.ElementType> = {
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
  success: "bg-green-600/15",
  error: "bg-red-600/15",
  info: "bg-blue-600/15",
};

function ToastItem({ toast: t, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

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

    const timer = setTimeout(() => {
      dismiss();
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

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

  const Icon = ICON_MAP[t.type];

  return (
    <Animated.View
      style={{ transform: [{ translateY }], opacity }}
      className={`mx-4 mb-2 rounded-xl px-4 py-3 flex-row items-center gap-3 border border-border/50 ${BG_MAP[t.type]}`}
    >
      <Icon size={18} color={COLOR_MAP[t.type]} />
      <Text className="text-zinc-200 text-sm flex-1" numberOfLines={2}>
        {t.message}
      </Text>
      <Pressable onPress={dismiss} hitSlop={8}>
        <X size={16} color="#71717a" />
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
