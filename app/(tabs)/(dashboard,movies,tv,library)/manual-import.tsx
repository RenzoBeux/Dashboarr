import { useLocalSearchParams } from "expo-router";
import { FileQuestion } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ManualImportView } from "@/components/services/manual-import-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ManualImportService } from "@/lib/manual-import";

/**
 * Manual import for one stuck Radarr/Sonarr grab (#306), pushed from the queue
 * issues sheet on the Movies, TV and Library tabs — the three that render
 * QueueIssuesBanner for those two services, which is exactly the array group
 * this file lives in.
 */
export default function ManualImportScreen() {
  const params = useLocalSearchParams<{
    service?: string;
    downloadId?: string;
    instanceId?: string;
    title?: string;
  }>();

  const service: ManualImportService | null =
    params.service === "radarr" || params.service === "sonarr"
      ? params.service
      : null;

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Manual import" />
      {service && params.downloadId ? (
        <ManualImportView
          service={service}
          downloadId={params.downloadId}
          instanceId={params.instanceId}
          releaseTitle={params.title}
        />
      ) : (
        <EmptyState
          icon={<Icon icon={FileQuestion} size={24} color="#71717a" />}
          title="Nothing to import"
          message="This screen needs a download to work on. Open it from the queue issues on the Movies or TV screen."
        />
      )}
    </ScreenWrapper>
  );
}
