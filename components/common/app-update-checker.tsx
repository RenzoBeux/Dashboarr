import { Sparkles } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ActionSheet } from "@/components/ui/action-sheet";
import { ICON } from "@/lib/constants";
import { NATIVE_VERSION } from "@/lib/app-version";
import { useAppUpdateCheck } from "@/hooks/use-app-update-check";

/**
 * Renders the "update available" prompt driven by useAppUpdateCheck. Uses the
 * styled ActionSheet (not a native Alert) so the launch prompt matches the rest
 * of the app and respects the no-native-dialog rule. Dismissing the sheet, or
 * tapping outside it, counts as "Later" and snoozes for a week; "Skip this
 * version" silences that version for good. Mounted once, at the root layout.
 */
export function AppUpdateChecker() {
  const { pending, openStore, skipVersion, snoozeUpdate } = useAppUpdateCheck();

  return (
    <ActionSheet
      visible={pending !== null}
      // Backdrop tap / swipe-down / cancel all count as "Later".
      onClose={snoozeUpdate}
      title="Update available"
      subtitle={
        pending
          ? `Version ${pending.storeVersion} is available. You're on ${NATIVE_VERSION}.`
          : undefined
      }
      actions={
        pending
          ? [
              {
                label: "Update now",
                icon: <Icon icon={Sparkles} size={ICON.MD} color="#3b82f6" />,
                onPress: () => openStore(pending.storeUrl),
              },
              {
                label: "Skip this version",
                onPress: () => skipVersion(pending.storeVersion),
              },
            ]
          : []
      }
    />
  );
}
