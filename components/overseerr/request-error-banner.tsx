import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertCircle, Copy, Check } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Icon } from "@/components/ui/icon";
import { brrrHaptic } from "@/lib/haptics";

export interface RequestError {
  // Friendly message shown inline.
  message: string;
  // Verbose payload (HTTP body / stack) copied to the clipboard so users can
  // share or search the real failure.
  copyText: string;
}

interface RequestErrorBannerProps {
  error: RequestError | null;
  className?: string;
}

// Inline error used by the Seerr request flows. Toasts fired from inside a
// <Modal> render behind it on Android, so request failures (which keep the
// modal open) are surfaced inline instead. Shared by RequestOptionsSheet and
// MediaDetailModal's quick-request path.
export function RequestErrorBanner({ error, className = "" }: RequestErrorBannerProps) {
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  // A new error resets the "Copied" affordance.
  useEffect(() => {
    setCopied(false);
  }, [error?.copyText]);

  const handleCopy = async () => {
    if (!error) return;
    await Clipboard.setStringAsync(error.copyText);
    brrrHaptic();
    setCopied(true);
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  if (!error) return null;

  return (
    <View
      className={`flex-row items-start gap-2 rounded-xl border border-red-600/40 bg-red-600/10 px-3 py-2.5 ${className}`}
    >
      <View className="pt-0.5">
        <Icon icon={AlertCircle} size={16} color="#f87171" />
      </View>
      <Text className="text-red-300 text-sm flex-1">{error.message}</Text>
      <Pressable
        onPress={handleCopy}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={copied ? "Error copied" : "Copy error"}
        className="flex-row items-center gap-1 pl-2 py-0.5 active:opacity-60"
      >
        <Icon
          icon={copied ? Check : Copy}
          size={14}
          color={copied ? "#4ade80" : "#fca5a5"}
        />
        <Text className={`text-xs ${copied ? "text-green-400" : "text-red-300"}`}>
          {copied ? "Copied" : "Copy"}
        </Text>
      </Pressable>
    </View>
  );
}
