import { useLocalSearchParams } from "expo-router";
import { FileQuestion } from "lucide-react-native";
import { BackHeader } from "@/components/common/back-header";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ArrFolderBrowser } from "@/components/services/arr-folder-browser";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import type { ManualImportService } from "@/lib/manual-import";

/**
 * "Import from folder" (#470): browse the Radarr/Sonarr host for a folder of
 * files copied there by hand, then review them on /manual-import beside it.
 * Pushed from the folder button in the Movies and TV headers, which also
 * render on the Library tab, so it lives in the same array group as
 * /manual-import.
 */
export default function ManualImportFolderScreen() {
  const params = useLocalSearchParams<{ service?: string; instanceId?: string }>();

  const service: ManualImportService | null =
    params.service === "radarr" || params.service === "sonarr"
      ? params.service
      : null;

  return (
    <ScreenWrapper scrollable={false}>
      <BackHeader title="Import from folder" />
      {service ? (
        <ArrFolderBrowser service={service} instanceId={params.instanceId} />
      ) : (
        <EmptyState
          icon={<Icon icon={FileQuestion} size={24} color="#71717a" />}
          title="Nothing to browse"
          message="Open this screen from the folder button on the Movies or TV screen."
        />
      )}
    </ScreenWrapper>
  );
}
