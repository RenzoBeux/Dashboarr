import {
  ActivityIndicator,
  Modal,
  View,
  Text,
  Platform,
  Pressable,
  ScrollView,
  Linking,
} from "react-native";
import {
  AlertTriangle,
  Info,
  ExternalLink,
  CheckCircle2,
  TestTube,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { useUiScale } from "@/hooks/use-ui-scale";
import { lightHaptic } from "@/lib/haptics";
import {
  testAllPathForHealthSource,
  HEALTH_TYPE_COLOR,
  type ArrHealthServiceId,
  type ArrHealthType,
} from "@/services/arr-health";
import {
  useTestAllForHealth,
  type ArrInstanceHealth,
} from "@/hooks/use-arr-health";

interface HealthIssuesSheetProps {
  visible: boolean;
  // Service kind of the listed instances; routes the "Test all" action (#268).
  // null when closed.
  serviceId: ArrHealthServiceId | null;
  // Display name of the tapped service kind (e.g. "Sonarr").
  serviceName: string;
  // Instances that currently have actionable health issues. null when closed.
  instances: ArrInstanceHealth[] | null;
  onClose: () => void;
}

// Read-only, non-chaining info sheet → plain props/useState (no useModalFlow),
// per the modal-sequencing rules in CLAUDE.md. Mirrors the pageSheet pattern in
// components/qbittorrent/category-sheet.tsx.
export function HealthIssuesSheet({
  visible,
  serviceId,
  serviceName,
  instances,
  onClose,
}: HealthIssuesSheetProps) {
  // Only label each section by instance when there's more than one to
  // disambiguate; a single-instance setup needs no header noise.
  const showInstanceNames = (instances?.length ?? 0) > 1;
  const scrollPadding = useSheetBottomPadding(16);
  const uiScale = useUiScale();
  // One mutation instance serves every row; each row matches `variables`
  // against its own (instanceId, source) for the pending spinner.
  const testAll = useTestAllForHealth();

  const openWiki = (url?: string) => {
    if (!url) return;
    lightHaptic();
    Linking.openURL(url).catch(() => {});
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-background">
        <SheetHeader title={`${serviceName} Health`} onClose={onClose} />

        <ScrollView
          contentContainerClassName="px-4 py-4 gap-4"
          contentContainerStyle={scrollPadding}
          showsVerticalScrollIndicator={false}
        >
          {/* The callers keep this sheet mounted while it dismisses, so a poll
              that resolves the last issue can empty it out from under an open
              sheet. Say so rather than showing a blank pane. */}
          {instances?.every((inst) => inst.issues.length === 0) ? (
            <EmptyState
              icon={<Icon icon={CheckCircle2} size={28} color="#22c55e" />}
              title="All clear"
              message={`${serviceName} has no health issues right now`}
            />
          ) : null}

          {instances?.map((inst) => (
            <View key={inst.instanceId} className="gap-2">
              {showInstanceNames ? (
                <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">
                  {inst.instanceName}
                </Text>
              ) : null}

              {inst.issues.map((issue, idx) => {
                // Upstream parity (#268): the *arr Health pages offer a
                // test-tube "Test All" retry only for provider status checks.
                const canTest =
                  serviceId != null &&
                  testAllPathForHealthSource(serviceId, issue.source) != null;
                const testing =
                  testAll.isPending &&
                  testAll.variables?.instanceId === inst.instanceId &&
                  testAll.variables?.source === issue.source;
                return (
                  <View
                    key={`${issue.source}:${idx}`}
                    className="flex-row gap-3 bg-surface border border-border rounded-2xl p-3"
                  >
                    <View className="pt-0.5">
                      <Icon
                        icon={issueIcon(issue.type)}
                        size={18}
                        color={HEALTH_TYPE_COLOR[issue.type]}
                      />
                    </View>
                    <View className="flex-1 gap-1">
                      <Text className="text-zinc-200 text-sm font-semibold">
                        {issue.source}
                      </Text>
                      <Text className="text-zinc-400 text-sm">{issue.message}</Text>
                      {canTest || issue.wikiUrl ? (
                        <View className="flex-row items-center gap-4 mt-1">
                          {canTest && serviceId ? (
                            <Pressable
                              onPress={() => {
                                lightHaptic();
                                testAll.mutate({
                                  serviceId,
                                  instanceId: inst.instanceId,
                                  source: issue.source,
                                });
                              }}
                              disabled={testing}
                              hitSlop={6}
                              className="flex-row items-center gap-1.5 active:opacity-70"
                            >
                              {testing ? (
                                <ActivityIndicator
                                  // Native spinner so it always animates (#196).
                                  // iOS clamps numeric sizes, so "small" there;
                                  // Android tracks the UI-scale setting.
                                  size={
                                    Platform.OS === "android"
                                      ? Math.round(13 * uiScale)
                                      : "small"
                                  }
                                  color="#3b82f6"
                                />
                              ) : (
                                <Icon icon={TestTube} size={13} color="#3b82f6" />
                              )}
                              <Text className="text-primary text-sm font-medium">
                                {testing ? "Testing…" : "Test all"}
                              </Text>
                            </Pressable>
                          ) : null}
                          {issue.wikiUrl ? (
                            <Pressable
                              onPress={() => openWiki(issue.wikiUrl)}
                              hitSlop={6}
                              className="flex-row items-center gap-1.5 active:opacity-70"
                            >
                              <Icon icon={ExternalLink} size={13} color="#3b82f6" />
                              <Text className="text-primary text-sm font-medium">
                                Open wiki
                              </Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

function issueIcon(type: ArrHealthType) {
  return type === "notice" ? Info : AlertTriangle;
}
