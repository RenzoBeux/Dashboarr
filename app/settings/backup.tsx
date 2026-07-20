import { useState } from "react";
import { Image } from "expo-image";
import { Upload, FolderDown, ImageOff } from "lucide-react-native";
import { toast, toastError } from "@/components/ui/toast";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { useConfigStore } from "@/store/config-store";
import type { ExportStage, ImportStage } from "@/store/config-store";
import { ProgressModal } from "@/components/common/progress-modal";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { PassphrasePrompt } from "@/components/common/passphrase-prompt";
import type { PassphraseMode, PassphraseResult } from "@/components/common/passphrase-prompt";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { reevaluateHomeNetworkAfterImport } from "@/lib/network";
import {
  forgetRememberedPassphrase,
  hasRememberedPassphrase,
  loadRememberedPassphrase,
  saveRememberedPassphrase,
} from "@/lib/config-passphrase";

export default function BackupSettingsScreen() {
  const [exportStage, setExportStage] = useState<ExportStage | null>(null);
  const [importStage, setImportStage] = useState<ImportStage | null>(null);
  const [hasRemembered, setHasRemembered] = useState(() => hasRememberedPassphrase());

  const exportConfig = useConfigStore((s) => s.exportConfig);
  const importConfig = useConfigStore((s) => s.importConfig);
  const demoMode = useConfigStore((s) => s.demoMode);
  const enableDemoMode = useConfigStore((s) => s.enableDemoMode);
  const disableDemoMode = useConfigStore((s) => s.disableDemoMode);

  // Modal sequencing (confirm → document picker, passphrase prompt →
  // ProgressModal/share sheet) goes through the flow — see
  // hooks/use-modal-flow.ts. The passphrase promise resolves only once the
  // prompt is fully dismissed, so whatever follows never presents mid-dismiss.
  const flow = useModalFlow<{
    confirmClearCache: void;
    confirmImport: void;
    passphrase: {
      mode: PassphraseMode;
      resolve: (value: PassphraseResult | null) => void;
    };
  }>();

  const requestPassphrase = (mode: PassphraseMode) =>
    new Promise<PassphraseResult | null>((resolve) => {
      flow.open("passphrase", { mode, resolve });
    });

  // After a successful op, reflect the user's "Remember" choice to the
  // Keychain/Keystore-backed store (save, or forget if they turned it off).
  const syncRememberedState = async (result: PassphraseResult) => {
    if (result.remember) {
      await saveRememberedPassphrase(result.passphrase);
      setHasRemembered(true);
    } else if (hasRemembered) {
      await forgetRememberedPassphrase();
      setHasRemembered(false);
    }
  };

  const handleExport = async () => {
    const result = await requestPassphrase("export");
    if (!result) return;
    try {
      await exportConfig(result.passphrase, setExportStage, async () => {
        // Reflect the "Remember on this device" choice while the app is still
        // foregrounded, before the share app-switch (see exportConfig / #180).
        // Best-effort: the export file is already written, so failing to
        // remember the passphrase must not abort the share or read as an export
        // failure. Mirror loadRememberedPassphrase, which degrades silently — a
        // user who cancels the biometric prompt knows it, and a genuine failure
        // just means they re-enter the passphrase next time.
        try {
          await syncRememberedState(result);
        } catch (err) {
          console.warn("Failed to persist remembered passphrase", err);
        }
      });
    } catch (e) {
      toastError("Failed to export config", e);
    } finally {
      setExportStage(null);
    }
  };

  const exportStageContent: Record<ExportStage, { title: string; subtitle?: string }> = {
    preparing: { title: "Preparing backup…" },
    encrypting: {
      title: "Encrypting…",
      subtitle: "Deriving a key from your passphrase. This takes a moment on mobile.",
    },
    finalizing: { title: "Almost done…" },
  };

  const importStageContent: Record<ImportStage, { title: string; subtitle?: string }> = {
    decrypting: {
      title: "Decrypting…",
      subtitle: "Deriving a key from your passphrase. This takes a moment on mobile.",
    },
    restoring: { title: "Restoring settings…" },
  };

  const performClearImageCache = async () => {
    flow.close();
    try {
      await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
      toast("Image cache cleared", "success");
    } catch (err) {
      toastError("Failed to clear image cache", err);
    }
  };

  // Runs via flow.whenClear from the import confirm, so the document picker
  // never presents while the ConfirmModal is still animating away.
  const performImport = async () => {
    // Captured from the requestPassphrase callback below — only set
    // if the picked file was encrypted and the user supplied a
    // passphrase. Plain-JSON legacy backups leave this null.
    let capturedResult: PassphraseResult | null = null;
    try {
      const success = await importConfig(async () => {
        capturedResult = await requestPassphrase("import");
        return capturedResult?.passphrase ?? null;
      }, setImportStage);
      if (success) {
        if (capturedResult) await syncRememberedState(capturedResult);
        toast("Configuration imported successfully", "success");
        // Import resets the away flag to its safe default, so local-only
        // services start "remote-only" until home is re-confirmed. Prompt for
        // Location + re-evaluate now so they come back online on the home WiFi
        // without the user hunting for a permission (#168). The import already
        // succeeded, so this runs detached — but if we're STILL away once it
        // settles (permission denied, no home network configured, or genuinely
        // away), tell the user why their services are on remote URLs and where
        // to fix it, instead of leaving every service silently stuck on remote.
        void reevaluateHomeNetworkAfterImport().then(() => {
          const st = useConfigStore.getState();
          if (st.autoSwitchNetwork && st.networkAwayFromHome) {
            toast(
              "Services are using remote URLs until your home WiFi is confirmed. Open Settings → Network → Home Networks to finish setup.",
              "info",
            );
          }
        });
      }
    } catch (e) {
      toastError("Invalid config file", e);
    } finally {
      setImportStage(null);
    }
  };

  return (
    <ScreenWrapper>
      <BackHeader title="Backup & Storage" />

      <SettingsGroup
        title="Backup & Storage"
        footer="Backups are encrypted with a passphrase you choose. Keep it safe — without it the backup cannot be restored."
      >
        <SettingsRow
          icon={Upload}
          label="Export settings"
          subtitle="Save an encrypted backup file"
          onPress={handleExport}
          disabled={exportStage !== null}
        />
        <SettingsRow
          icon={FolderDown}
          label="Import settings"
          subtitle="Restore from a backup file"
          onPress={() => flow.open("confirmImport")}
          disabled={importStage !== null}
        />
        <SettingsRow
          icon={ImageOff}
          label="Clear image cache"
          subtitle="Free up disk space used by cached posters and backdrops"
          onPress={() => flow.open("confirmClearCache")}
        />
      </SettingsGroup>

      <SettingsGroup title="Advanced">
        <SettingsToggleRow
          label="Demo Mode"
          description="Show sample data — no server required"
          value={demoMode}
          onValueChange={(v) => {
            if (v) {
              enableDemoMode();
            } else {
              void disableDemoMode();
            }
          }}
        />
      </SettingsGroup>

      <ProgressModal
        visible={exportStage !== null}
        title={exportStage ? exportStageContent[exportStage].title : ""}
        subtitle={exportStage ? exportStageContent[exportStage].subtitle : undefined}
      />

      <ProgressModal
        visible={importStage !== null}
        title={importStage ? importStageContent[importStage].title : ""}
        subtitle={importStage ? importStageContent[importStage].subtitle : undefined}
      />

      <ConfirmModal
        {...flow.bind("confirmClearCache")}
        title="Clear image cache"
        message="Posters and backdrops will be re-downloaded the next time you view them."
        icon={ImageOff}
        tone="danger"
        confirmLabel="Clear"
        onConfirm={() => void performClearImageCache()}
      />

      <ConfirmModal
        {...flow.bind("confirmImport")}
        title="Import settings"
        message="This will overwrite all current settings with the imported configuration. Continue?"
        icon={FolderDown}
        tone="danger"
        confirmLabel="Import"
        onConfirm={() => {
          flow.close();
          flow.whenClear(() => void performImport());
        }}
      />

      <PassphrasePrompt
        visible={flow.isOpen("passphrase")}
        mode={flow.payload("passphrase")?.mode ?? "import"}
        hasRemembered={hasRemembered}
        onUseRemembered={async () => {
          const saved = await loadRememberedPassphrase();
          if (!saved) setHasRemembered(false);
          return saved;
        }}
        onSubmit={(result) => {
          const request = flow.payload("passphrase");
          flow.close();
          flow.whenClear(() => request?.resolve(result));
        }}
        onCancel={() => {
          const request = flow.payload("passphrase");
          flow.close();
          flow.whenClear(() => request?.resolve(null));
        }}
        onClosed={flow.onClosed}
      />
    </ScreenWrapper>
  );
}
