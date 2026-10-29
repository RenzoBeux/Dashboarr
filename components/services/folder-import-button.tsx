import { Pressable } from "react-native";
import { useRouter } from "expo-router";
import { FolderInput } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { useInstanceTarget } from "@/hooks/use-instance-target";
import { ICON } from "@/lib/constants";
import type { ManualImportService } from "@/lib/manual-import";

/**
 * Header button opening "Import from folder" (#470) for the Movies or TV
 * screen. The active instance is pinned into the route, so switching instance
 * on the tab mid-flow can't retarget a browse or an import already under way.
 */
export function FolderImportButton({ service }: { service: ManualImportService }) {
  const router = useRouter();
  const { instanceId } = useInstanceTarget(service);
  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/manual-import-folder",
          params: { service, ...(instanceId ? { instanceId } : {}) },
        })
      }
      className="p-2 active:opacity-70"
      accessibilityLabel="Import from folder"
    >
      <Icon icon={FolderInput} size={ICON.LG} color="#a1a1aa" />
    </Pressable>
  );
}
