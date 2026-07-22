import { Modal, View, Text, Pressable, ScrollView, Linking } from "react-native";
import { AlertTriangle, Info, ExternalLink } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { SheetHeader } from "@/components/ui/sheet-header";
import { useSheetBottomPadding } from "@/hooks/use-bottom-inset";
import { lightHaptic } from "@/lib/haptics";
import { HEALTH_TYPE_COLOR, type ArrHealthType } from "@/services/arr-health";
import type { ArrInstanceHealth } from "@/hooks/use-arr-health";

interface HealthIssuesSheetProps {
  visible: boolean;
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
  serviceName,
  instances,
  onClose,
}: HealthIssuesSheetProps) {
  // Only label each section by instance when there's more than one to
  // disambiguate; a single-instance setup needs no header noise.
  const showInstanceNames = (instances?.length ?? 0) > 1;
  const scrollPadding = useSheetBottomPadding(16);

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
          {instances?.map((inst) => (
            <View key={inst.instanceId} className="gap-2">
              {showInstanceNames ? (
                <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">
                  {inst.instanceName}
                </Text>
              ) : null}

              {inst.issues.map((issue, idx) => (
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
                    {issue.wikiUrl ? (
                      <Pressable
                        onPress={() => openWiki(issue.wikiUrl)}
                        hitSlop={6}
                        className="flex-row items-center gap-1.5 mt-1 active:opacity-70"
                      >
                        <Icon icon={ExternalLink} size={13} color="#3b82f6" />
                        <Text className="text-primary text-sm font-medium">
                          Open wiki
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ))}
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
