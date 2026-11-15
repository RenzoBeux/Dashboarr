import { useRouter } from "expo-router";
import { FolderInput } from "lucide-react-native";
import { ToolbarIconButton } from "@/components/common/library-toolbar";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import type { ManualImportService } from "@/lib/manual-import";

/**
 * Toolbar button opening "Import from folder" (#470) for the Movies or TV
 * screen. The active instance is pinned into the route, so switching instance
 * on the tab mid-flow can't retarget a browse or an import already under way.
 */
export function FolderImportButton({ service }: { service: ManualImportService }) {
  const router = useRouter();
  const { instanceId } = useInstanceTarget(service);
  return (
    <ToolbarIconButton
      icon={FolderInput}
      label="Import from folder"
      onPress={() =>
        router.push({
          pathname: "/manual-import-folder",
          params: { service, ...(instanceId ? { instanceId } : {}) },
        })
      }
    />
  );
}
