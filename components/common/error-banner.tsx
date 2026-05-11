import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { AlertCircle, Copy, Check } from "lucide-react-native";
import * as Clipboard from "expo-clipboard";
import { Icon } from "@/components/ui/icon";
import {
  formatErrorForCopy,
  getHttpErrorMessage,
} from "@/lib/http-client";
import { brrrHaptic } from "@/lib/haptics";

interface ErrorBannerProps {
  // The caught error from a query/mutation. The banner falls back to a
  // generic message and a stringified error when the error has no useful
  // shape, so it's safe to pass `unknown`.
  error: unknown;
  // Optional headline shown above the server message — e.g. "Failed to load
  // series". The body shows the server's `{ message }` body or err.message.
  title?: string;
  // Extra Tailwind classes for the outer container.
  className?: string;
}

// Reusable inline error display with copy-to-clipboard. Designed to replace
// silent "X not found" empty states on detail screens, and any inline error
// rendering inside a Modal where toasts would be hidden behind the modal.
// The Copy button puts the verbose error (HTTP status + URL + body, or
// Error name/message/stack) on the clipboard — not just the visible summary.
export function ErrorBanner({
  error,
  title = "Something went wrong",
  className = "",
}: ErrorBannerProps) {
  const serverMsg = getHttpErrorMessage(error);
  const message =
    serverMsg ??
    (error instanceof Error && error.message ? error.message : null) ??
    "Unknown error";
  const copyText = formatErrorForCopy(error);

  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    await Clipboard.setStringAsync(copyText);
    brrrHaptic();
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <View
      className={`rounded-xl border border-red-600/40 bg-red-600/10 px-3 py-3 ${className}`}
    >
      <View className="flex-row items-start gap-2">
        <View className="pt-0.5">
          <Icon icon={AlertCircle} size={16} color="#f87171" />
        </View>
        <View className="flex-1">
          <Text className="text-red-300 text-sm font-semibold">{title}</Text>
          <Text className="text-red-200/90 text-sm mt-1">{message}</Text>
        </View>
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
          <Text
            className={`text-xs ${copied ? "text-green-400" : "text-red-300"}`}
          >
            {copied ? "Copied" : "Copy"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
