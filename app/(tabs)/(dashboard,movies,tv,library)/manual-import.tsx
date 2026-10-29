import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { FileQuestion } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ManualImportView } from "@/components/services/manual-import-view";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ManualImportService, ManualImportSource } from "@/lib/manual-import";

/**
 * Manual import for one stuck Radarr/Sonarr grab (#306), pushed from the queue
 * issues sheet on the Movies, TV and Library tabs — the three that render
 * QueueIssuesBanner for those two services, which is exactly the array group
 * this file lives in. The same screen reviews a server folder (#470), pushed
 * from the "Import from folder" browser beside it with `folder` instead of
 * `downloadId`.
 */
export default function ManualImportScreen() {
  const params = useLocalSearchParams<{
    service?: string;
    downloadId?: string;
    folder?: string;
    instanceId?: string;
    title?: string;
  }>();

  const service: ManualImportService | null =
    params.service === "radarr" || params.service === "sonarr"
      ? params.service
      : null;

  const { downloadId, folder } = params;
  const source = useMemo<ManualImportSource | null>(
    () =>
      downloadId
        ? { kind: "download", downloadId }
        : folder
          ? { kind: "folder", folder }
          : null,
    [downloadId, folder],
  );

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Manual import" />
      {service && source ? (
        <ManualImportView
          service={service}
          source={source}
          instanceId={params.instanceId}
          subtitle={source.kind === "folder" ? source.folder : params.title}
        />
      ) : (
        <EmptyState
          icon={<Icon icon={FileQuestion} size={24} color="#71717a" />}
          title="Nothing to import"
          message="This screen needs a download or a folder to work on. Open it from the queue issues or the folder button on the Movies or TV screen."
        />
      )}
    </ScreenWrapper>
  );
}
