import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
import { useGrabRelease } from "@/hooks/use-prowlarr";
import type { GrabFlowProps } from "@/lib/indexer-adapter";

// Prowlarr grab: server-side — POST /search {guid, indexerId} and Prowlarr
// forwards the release to whatever download client it has configured.
export function ProwlarrGrabFlow({ release, onClose, instanceId }: GrabFlowProps) {
  const grabRelease = useGrabRelease(instanceId);

  const confirmGrab = () => {
    if (!release?.grab) return;
    grabRelease.mutate(release.grab, {
      onSuccess: () => toast("Sent to download client"),
      onError: (err) => toastError("Failed to grab release", err),
    });
    onClose();
  };

  return (
    <ConfirmModal
      visible={release !== null}
      title="Grab Release"
      message={release ? `Send "${release.title}" to download client?` : ""}
      confirmLabel="Grab"
      onConfirm={confirmGrab}
      onCancel={onClose}
    />
  );
}
