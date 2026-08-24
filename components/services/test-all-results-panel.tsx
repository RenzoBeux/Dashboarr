import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  TestTube,
  X,
  XCircle,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { useUiScale } from "@/hooks/use-ui-scale";
import { formatErrorForCopy, getHttpErrorMessage } from "@/lib/http-client";
import {
  describeTestAllOutcome,
  formatTestAllReport,
  type TestAllOutcome,
} from "@/services/arr-health";

export type TestAllStatus = "pending" | "success" | "error";

interface TestAllResultsPanelProps {
  visible: boolean;
  // Provider nouns for the copy shown before the result lands ("indexer" /
  // "indexers"); the outcome carries its own once it arrives.
  noun: string;
  nouns: string;
  status: TestAllStatus;
  outcome?: TestAllOutcome;
  error?: unknown;
  onClose: () => void;
}

/**
 * Full-run results for a health item's "Test All" (#268): a spinner while the
 * server works through every provider, then one row per provider with its pass
 * or fail reason.
 *
 * Deliberately NOT a React Native `Modal`. It renders as an overlay *inside*
 * the health sheet's own modal, because the sheet is a pageSheet `Modal`
 * without `onClosed` plumbing and the rules in CLAUDE.md forbid chaining one
 * into another — a second view controller presented over a dismissing one is
 * the iOS/Fabric freeze from #83. An absolutely positioned view reads the same
 * to the user with none of that risk, and it can grow to whatever the report
 * needs, which a toast could not.
 */
export function TestAllResultsPanel({
  visible,
  noun,
  nouns,
  status,
  outcome,
  error,
  onClose,
}: TestAllResultsPanelProps) {
  const uiScale = useUiScale();
  const opacity = useRef(new Animated.Value(0)).current;
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  useEffect(() => {
    if (!visible) setCopied(false);
  }, [visible]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  const report =
    status === "success" && outcome
      ? formatTestAllReport(outcome)
      : status === "error" && error !== undefined
        ? formatErrorForCopy(error)
        : null;

  const handleCopy = useCallback(async () => {
    if (!report) return;
    // Button fires its own press haptic; the label swap is the confirmation.
    await Clipboard.setStringAsync(report);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopied(false), 1500);
  }, [report]);

  if (!visible) return null;

  const verdict = outcome ? describeTestAllOutcome(outcome) : null;
  const headline =
    status === "pending"
      ? `Testing ${nouns}…`
      : status === "error"
        ? "Couldn't run the tests"
        : (verdict?.headline ?? "Tests finished");

  const tone: "info" | "ok" | "bad" =
    status === "pending" ? "info" : status === "error" ? "bad" : verdict?.ok ? "ok" : "bad";
  const HeadIcon =
    tone === "info" ? TestTube : tone === "ok" ? CheckCircle2 : XCircle;
  const headColor =
    tone === "info" ? "#3b82f6" : tone === "ok" ? "#22c55e" : "#ef4444";
  const headBg =
    tone === "info" ? "bg-primary/15" : tone === "ok" ? "bg-success/15" : "bg-danger/15";

  return (
    <View className="absolute inset-0 z-40">
      {/* Backdrop doubles as the tap-to-dismiss target. */}
      <Pressable
        className="absolute inset-0 bg-black/75"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss test results"
      />
      <View
        className="flex-1 items-center justify-center px-4"
        pointerEvents="box-none"
      >
        <Animated.View
          style={{ opacity, maxHeight: "82%" }}
          className="w-full max-w-md bg-surface border border-border rounded-2xl overflow-hidden"
        >
          <View className="flex-row items-center gap-3 px-4 pt-4 pb-3">
            <View className={`${headBg} rounded-xl p-2.5`}>
              <Icon icon={HeadIcon} size={20} color={headColor} />
            </View>
            <Text className="text-zinc-100 text-base font-semibold flex-1">
              {headline}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              className="p-1 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <Icon icon={X} size={20} color="#a1a1aa" />
            </Pressable>
          </View>

          {status === "pending" ? (
            <View className="items-center gap-3 px-6 py-8">
              <ActivityIndicator
                // Native spinner so it always animates (#196). iOS clamps
                // numeric sizes, so "large" there; Android tracks UI scale.
                size={Platform.OS === "android" ? Math.round(32 * uiScale) : "large"}
                color="#3b82f6"
              />
              <Text className="text-zinc-400 text-sm text-center leading-5">
                {`Each ${noun} is contacted in turn, so this can take a minute on a large setup.`}
              </Text>
            </View>
          ) : null}

          {status === "error" ? (
            // `shrink` matters: RN defaults flexShrink to 0, so without it a
            // long list grows past the card's maxHeight and the footer is
            // clipped away by overflow-hidden instead of the list scrolling.
            <ScrollView className="shrink" contentContainerClassName="px-4 pb-4">
              <Text className="text-zinc-300 text-sm leading-5">
                {errorMessage(error)}
              </Text>
            </ScrollView>
          ) : null}

          {status === "success" && outcome ? (
            outcome.providers.length === 0 ? (
              <View className="px-4 pb-5">
                <Text className="text-zinc-400 text-sm leading-5">
                  {`Nothing ran: the server only tests ${nouns} that are enabled and have valid settings.`}
                </Text>
              </View>
            ) : (
              <ScrollView className="shrink" contentContainerClassName="px-4 pb-4 gap-2">
                {outcome.providers.map((p) => (
                  <View
                    key={`${p.id}:${p.name}`}
                    className="flex-row gap-2.5 rounded-xl bg-surface-light px-3 py-2.5"
                  >
                    <View className="pt-0.5">
                      <Icon
                        icon={p.ok ? CheckCircle2 : AlertTriangle}
                        size={16}
                        color={p.ok ? "#22c55e" : "#ef4444"}
                      />
                    </View>
                    <View className="flex-1 gap-0.5">
                      <Text className="text-zinc-200 text-sm font-medium">
                        {p.name}
                      </Text>
                      {p.message ? (
                        <Text className="text-zinc-400 text-sm leading-5">
                          {p.message}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </ScrollView>
            )
          ) : null}

          {status !== "pending" ? (
            <View className="flex-row gap-3 px-4 py-3 border-t border-border">
              {report ? (
                <Button
                  label={copied ? "Copied" : "Copy report"}
                  variant="outline"
                  onPress={handleCopy}
                  className="flex-1"
                  icon={
                    <Icon
                      icon={copied ? Check : Copy}
                      size={16}
                      color={copied ? "#4ade80" : "#a1a1aa"}
                    />
                  }
                />
              ) : null}
              <Button label="Done" onPress={onClose} className="flex-1" />
            </View>
          ) : null}
        </Animated.View>
      </View>
    </View>
  );
}

// Same precedence as toastError: the server's own `{ message }` wins, then the
// Error's message, then a generic line. The Copy button carries the raw error.
function errorMessage(err: unknown): string {
  const serverMsg = err ? getHttpErrorMessage(err) : undefined;
  if (serverMsg) return serverMsg;
  if (err instanceof Error && err.message) return err.message;
  return "The request failed before the tests could run.";
}
