import { useState, useCallback, useEffect, useRef } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Bell, QrCode, Unlink, Cloud, CloudOff, RefreshCw, CloudUpload, CloudDownload, Trash2 } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { toast, toastError } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { ActionSheet } from "@/components/ui/action-sheet";
import { PassphrasePrompt } from "@/components/common/passphrase-prompt";
import { ProgressModal } from "@/components/common/progress-modal";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { IMPORT_STAGE_COPY, usePassphrasePrompt } from "@/hooks/use-passphrase-prompt";
import type { PassphraseRequest } from "@/hooks/use-passphrase-prompt";
import { useBackendStore } from "@/store/backend-store";
import { useConfigStore } from "@/store/config-store";
import type { ImportStage } from "@/store/config-store";
import { CURRENT_CONFIG_VERSION } from "@/store/config-migrations";
import {
  deleteConfigBackup,
  getBackendHealth,
  getConfigBackup,
  listConfigBackups,
  pairClaim,
  pushConfigSnapshot,
  testApprise,
  testPush,
  unregisterDevice,
} from "@/services/backend-api";
import type { BackupMeta } from "@/services/backend-api";
import { uploadConfigBackup } from "@/services/backend-backup";
import { WEB_SLOT_ID } from "@/services/backend-api";
import { markWebSlotApplied, noteBackupList } from "@/services/web-slot-watch";
import { isWebSlotPending } from "@/store/backend-store";
import { getExpoPushToken, hasProjectId } from "@/lib/expo-push";
import { normalizeServiceUrl } from "@/lib/url-validation";
import { requireDeviceAuth } from "@/lib/device-auth";
import { deriveKeyHex, generateSaltHex, PBKDF2_ITERATIONS } from "@/lib/config-crypto";
import { NATIVE_VERSION } from "@/lib/app-version";
import { reevaluateHomeNetworkAfterImport } from "@/lib/network";
import { formatBytes, formatTimeAgo } from "@/lib/utils";
import { Toggle } from "@/components/ui/toggle";

type Mode = "summary" | "scanning" | "manual";
type BackupStage = "deriving" | ImportStage;

const BACKUP_STAGE_COPY: Record<BackupStage, { title: string; subtitle?: string }> = {
  deriving: {
    title: "Preparing backup key…",
    subtitle: "Deriving a key from your passphrase. This takes a moment on mobile.",
  },
  ...IMPORT_STAGE_COPY,
};

function slotLabel(slot: BackupMeta): string {
  if (slot.deviceId === WEB_SLOT_ID) return "Web editor";
  if (slot.mine) return "This device";
  const platform = slot.platform === "ios" ? "iPhone" : slot.platform === "android" ? "Android" : slot.platform;
  return `${platform} · ${slot.deviceId.slice(0, 8)}`;
}

function slotSubtitle(slot: BackupMeta): string {
  const isWeb = slot.deviceId === WEB_SLOT_ID;
  const parts = [
    isWeb ? "edited in the backend's web UI" : `app ${slot.appVersion ?? "?"}`,
    formatTimeAgo(new Date(slot.updatedAt).toISOString()),
    formatBytes(slot.sizeBytes),
  ];
  if (!slot.paired && !isWeb) parts.push("unpaired");
  if (slot.configVersion > CURRENT_CONFIG_VERSION) parts.push("needs a newer app");
  return parts.join(" · ");
}

/** A backend that predates the backup endpoints answers 404 to the list. */
function isUnsupported(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 404;
}

/**
 * Opts the backend's hostname into the app's per-host TLS bypass (#357).
 *
 * Mirrors the per-instance "Allow invalid certificates" toggle in
 * components/integrations/service-editor.tsx so the two read as one feature.
 * Like that one it applies instantly rather than on a save, because it programs
 * a native host allowlist — a deferred toggle would appear to do nothing.
 *
 * Rendered on every pairing surface (URL entry, manual token, and the paired
 * summary), since the user may only discover they need it after a failed claim,
 * or long after pairing if they later move the backend behind a TLS proxy.
 */
function CertToggle({
  value,
  onValueChange,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
}) {
  return (
    <Toggle
      label="Allow invalid certificates"
      description="Skip TLS certificate checks for the backend URL. Needed when it's served with a self-signed certificate or one from your own internal CA, which phones don't trust even when the browser does. Only enable for a server you trust."
      value={value}
      onValueChange={onValueChange}
    />
  );
}

function parseQrPayload(data: string): { token: string; url?: string } | null {
  // Raw hex token (32 chars = 16 random bytes) — backend without PUBLIC_URL
  const trimmed = data.trim();
  if (/^[0-9a-f]{32}$/i.test(trimmed)) return { token: trimmed };
  // JSON with url + token (backend has PUBLIC_URL set)
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed.token === "string") {
      return {
        token: parsed.token,
        url: typeof parsed.url === "string" ? parsed.url : undefined,
      };
    }
  } catch {
    // not JSON
  }
  return null;
}

export default function BackendScreen() {
  const url = useBackendStore((s) => s.url);
  const sharedSecret = useBackendStore((s) => s.sharedSecret);
  const isHealthy = useBackendStore((s) => s.isHealthy);
  const pair = useBackendStore((s) => s.pair);
  const unpair = useBackendStore((s) => s.unpair);
  const ignoreCertErrors = useBackendStore((s) => s.ignoreCertErrors);
  const setIgnoreCertErrors = useBackendStore((s) => s.setIgnoreCertErrors);
  const setDraftUrl = useBackendStore((s) => s.setDraftUrl);
  const draftUrl = useBackendStore((s) => s.draftUrl);
  const deviceId = useBackendStore((s) => s.deviceId);
  const backupEnabled = useBackendStore((s) => s.backupEnabled);
  const enableBackup = useBackendStore((s) => s.enableBackup);
  const disableBackup = useBackendStore((s) => s.disableBackup);
  const lastBackupAt = useBackendStore((s) => s.lastBackupAt);
  const lastBackupError = useBackendStore((s) => s.lastBackupError);
  const backupInFlight = useBackendStore((s) => s.backupInFlight);
  const importConfigFromEnvelope = useConfigStore((s) => s.importConfigFromEnvelope);
  const webSlotPending = useBackendStore((s) => isWebSlotPending(s));

  const [mode, setMode] = useState<Mode>("summary");
  const [busy, setBusy] = useState(false);
  const [backendUrl, setBackendUrl] = useState("");
  // Config backup (Refs #385)
  const [backupStage, setBackupStage] = useState<BackupStage | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupSupported, setBackupSupported] = useState<boolean | null>(null);
  const [slots, setSlots] = useState<BackupMeta[]>([]);
  // Something to open once the ProgressModal has fully dismissed. The modal
  // is not a flow step (it has no cancel path), so a follow-up modal must
  // wait for its onClosed rather than present over its dismiss animation.
  const afterProgressRef = useRef<(() => void) | null>(null);
  const webSlot = slots.find((s) => s.deviceId === WEB_SLOT_ID);

  // Every chained modal on this screen goes through the flow (see
  // hooks/use-modal-flow.ts): confirm → sheet → passphrase → progress, and the
  // post-pair restore prompt. `offerEnableAfterRestore` carries the passphrase
  // the user just typed so enabling backup on this phone needs no second
  // prompt (device auth still applies).
  const flow = useModalFlow<{
    confirmUnpair: void;
    confirmRotate: void;
    confirmRestore: BackupMeta[];
    pickSlot: BackupMeta[];
    manageSlots: BackupMeta[];
    confirmDeleteSlot: BackupMeta;
    confirmDisableBackup: void;
    offerEnableAfterRestore: string;
    passphrase: PassphraseRequest;
  }>();
  const { hasRemembered, requestPassphrase, syncRememberedState, useRemembered } =
    usePassphrasePrompt((request) => flow.open("passphrase", request));
  const [manualToken, setManualToken] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  // Synchronous guard — camera onBarcodeScanned can fire multiple times before
  // setBusy(true) causes a re-render, so we can't rely on the busy state alone.
  const claimingRef = useRef(false);

  const projectReady = hasProjectId();

  const handleClaim = useCallback(
    async (token: string, urlOverride?: string) => {
      if (claimingRef.current) return;
      const rawUrl = urlOverride ?? backendUrl;
      const trimmedUrl = normalizeServiceUrl(rawUrl).replace(/\/$/, "");
      if (!trimmedUrl) {
        toast("Enter the backend URL first", "error");
        setMode("summary");
        return;
      }
      setBackendUrl(trimmedUrl);
      // Publish the host BEFORE any network call so the native TLS-bypass
      // allowlist already covers it if "Allow invalid certificates" is on —
      // POST /pair/claim is itself the request that needs the bypass (#357).
      // The store subscription runs synchronously, so this is in place by the
      // time pairClaim fires. Covers the QR path too: `urlOverride` is
      // normalized above, so a host the user never typed still lands here.
      setDraftUrl(trimmedUrl);
      claimingRef.current = true;
      setBusy(true);
      try {
        const expoPushToken = await getExpoPushToken();
        if (!expoPushToken) {
          toast("Push permissions denied or projectId missing", "error");
          return;
        }
        const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
        const result = await pairClaim(trimmedUrl, token, expoPushToken, platform, NATIVE_VERSION);
        // Persist the URL that actually answered. pairClaim may have upgraded a
        // public http:// host to https:// to dodge the edge redirect that breaks
        // pairing (#218); persisting it keeps later calls off that downgrade.
        await pair({ url: result.baseUrl, sharedSecret: result.sharedSecret, deviceId: result.deviceId });
        // Kick a health check and an initial config sync immediately.
        try {
          await getBackendHealth();
        } catch {
          /* ignore, poller will retry */
        }
        try {
          await pushConfigSnapshot();
        } catch {
          /* ignore, debounced bridge will retry on next change */
        }
        toast("Backend paired", "success");
        // Leave scanning mode first so the camera is unmounted before any
        // modal presents over the summary.
        setMode("summary");
        void openRestore("pair");
      } catch (err) {
        console.warn("pair failed", err);
        toastError("Pairing failed", err);
        // Only release the guard on failure so the user can retry. On success
        // we intentionally keep it latched — the camera stays mounted briefly
        // after the success toast, and any buffered native scan would
        // otherwise re-POST the (now-claimed) token and trip a 401.
        claimingRef.current = false;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [backendUrl, pair, setDraftUrl],
  );

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (claimingRef.current) return;
      const result = parseQrPayload(data);
      if (!result) {
        toast("Unrecognized QR code", "error");
        return;
      }
      if (result.url) setBackendUrl(result.url);
      void handleClaim(result.token, result.url);
    },
    [handleClaim],
  );

  const handleManual = useCallback(async () => {
    if (!manualToken.trim()) {
      toast("Enter a pairing token", "error");
      return;
    }
    await handleClaim(manualToken.trim());
  }, [manualToken, handleClaim]);

  const handleTestPush = useCallback(async () => {
    setBusy(true);
    try {
      await testPush();
      toast("Test push sent", "success");
    } catch (err) {
      toastError("Test push failed", err);
    } finally {
      setBusy(false);
    }
  }, []);

  // --- Apprise (issue #220) ---
  // Local-edit the fields and commit the whole object to the store on blur /
  // toggle, so we don't write AsyncStorage on every keystroke. The store change
  // auto-syncs to the backend via ConfigSyncBridge (debounced).
  const storedApprise = useConfigStore((s) => s.notificationSettings.apprise);
  const setNotificationSetting = useConfigStore((s) => s.setNotificationSetting);
  const [appriseEnabled, setAppriseEnabled] = useState(storedApprise?.enabled ?? false);
  const [appriseUrl, setAppriseUrl] = useState(storedApprise?.url ?? "");
  const [appriseTags, setAppriseTags] = useState(storedApprise?.tags ?? "");
  const [appriseBusy, setAppriseBusy] = useState(false);

  const commitApprise = useCallback(
    (next: { enabled: boolean; url: string; tags: string }) => {
      setNotificationSetting("apprise", next);
    },
    [setNotificationSetting],
  );

  const handleAppriseToggle = useCallback(
    (value: boolean) => {
      setAppriseEnabled(value);
      commitApprise({ enabled: value, url: appriseUrl, tags: appriseTags });
    },
    [appriseUrl, appriseTags, commitApprise],
  );

  const handleAppriseUrlBlur = useCallback(() => {
    const normalized = normalizeServiceUrl(appriseUrl);
    setAppriseUrl(normalized);
    commitApprise({ enabled: appriseEnabled, url: normalized, tags: appriseTags });
  }, [appriseEnabled, appriseUrl, appriseTags, commitApprise]);

  const handleAppriseTagsBlur = useCallback(() => {
    commitApprise({ enabled: appriseEnabled, url: appriseUrl, tags: appriseTags });
  }, [appriseEnabled, appriseUrl, appriseTags, commitApprise]);

  const handleAppriseTest = useCallback(async () => {
    // Persist + flush immediately so the backend tests against the latest URL,
    // bypassing the ConfigSyncBridge debounce.
    const normalized = normalizeServiceUrl(appriseUrl);
    setAppriseUrl(normalized);
    commitApprise({ enabled: appriseEnabled, url: normalized, tags: appriseTags });
    setAppriseBusy(true);
    try {
      await pushConfigSnapshot();
      await testApprise();
      toast("Apprise test sent", "success");
    } catch (err) {
      toastError("Apprise test failed", err);
    } finally {
      setAppriseBusy(false);
    }
  }, [appriseEnabled, appriseUrl, appriseTags, commitApprise]);

  const handleUnpair = useCallback(() => flow.open("confirmUnpair"), [flow]);

  const performUnpair = useCallback(async () => {
    setBusy(true);
    try {
      try {
        await unregisterDevice();
      } catch {
        /* ignore — unpair locally even if server is unreachable */
      }
      await unpair();
      toast("Backend unpaired", "success");
    } finally {
      setBusy(false);
    }
  }, [unpair]);

  const handleRotate = useCallback(() => flow.open("confirmRotate"), [flow]);

  const performRotate = useCallback(async () => {
    setBusy(true);
    try {
      try {
        await unregisterDevice();
      } catch {
        /* ignore — rotate locally even if server is unreachable */
      }
      await unpair();
      // Drops us into the un-paired summary state; user scans a new QR.
      toast("Secret rotated — scan a new pairing QR", "success");
    } finally {
      setBusy(false);
    }
  }, [unpair]);

  // --- Config backup (Refs #385) ---

  // Probe once per pairing so the card can say "update the backend" instead
  // of failing on first use. Also refreshes the own-slot knowledge: with no
  // own slot the next upload must not be skipped by a stale hash.
  useEffect(() => {
    if (!url || !sharedSecret) {
      setBackupSupported(null);
      return;
    }
    let cancelled = false;
    listConfigBackups()
      .then(({ backups }) => {
        if (cancelled) return;
        setBackupSupported(true);
        setSlots(backups);
        noteBackupList(backups);
      })
      .catch((err: unknown) => {
        if (!cancelled) setBackupSupported(isUnsupported(err) ? false : null);
      });
    return () => {
      cancelled = true;
    };
  }, [url, sharedSecret]);

  const refreshSlots = useCallback(async () => {
    try {
      const { backups } = await listConfigBackups();
      setSlots(backups);
      noteBackupList(backups);
    } catch {
      /* the next probe or resume will retry */
    }
  }, []);

  /** Derive the key from a passphrase, store it, upload once. Shared by the toggle and the post-restore offer. */
  const enableBackupWith = useCallback(
    async (passphrase: string) => {
      setBackupStage("deriving");
      try {
        const saltHex = generateSaltHex();
        const keyHex = await deriveKeyHex(passphrase, saltHex, PBKDF2_ITERATIONS);
        await enableBackup({ saltHex, keyHex, iterations: PBKDF2_ITERATIONS });
        await uploadConfigBackup({ force: true });
        toast("Backup enabled and uploaded", "success");
      } finally {
        setBackupStage(null);
      }
    },
    [enableBackup],
  );

  const handleEnableBackup = useCallback(async () => {
    try {
      if ((await requireDeviceAuth("Authenticate to enable backend backup")) === "cancelled") return;
      const result = await requestPassphrase("export");
      if (!result) return;
      await enableBackupWith(result.passphrase);
      try {
        await syncRememberedState(result);
      } catch (err) {
        console.warn("Failed to persist remembered passphrase", err);
      }
    } catch (err) {
      toastError("Could not enable backup", err);
    }
  }, [enableBackupWith, requestPassphrase, syncRememberedState]);

  const performDisableBackup = useCallback(async () => {
    setBackupBusy(true);
    try {
      await disableBackup();
      if (deviceId) {
        try {
          await deleteConfigBackup(deviceId);
        } catch {
          /* best effort — the slot can be removed from Manage later */
        }
      }
      toast("Backup disabled", "success");
    } finally {
      setBackupBusy(false);
    }
  }, [disableBackup, deviceId]);

  const handleBackupNow = useCallback(async () => {
    setBackupBusy(true);
    try {
      await uploadConfigBackup({ force: true });
      toast("Backup uploaded", "success");
    } catch (err) {
      toastError("Backup failed", err);
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const openRestore = useCallback(
    async (source: "pair" | "button") => {
      let slots: BackupMeta[];
      try {
        slots = (await listConfigBackups()).backups;
      } catch (err) {
        if (source === "button") {
          toastError(
            isUnsupported(err) ? "Update the backend to 1.6 or newer to use config backups" : "Could not list backups",
            err,
          );
        }
        return;
      }
      if (slots.length === 0) {
        if (source === "button") toast("No backup on this backend yet", "info");
        return;
      }
      flow.open("confirmRestore", slots);
    },
    [flow],
  );

  const restoreFromSlot = useCallback(
    async (slot: BackupMeta) => {
      if (slot.configVersion > CURRENT_CONFIG_VERSION) {
        toast("This backup needs a newer app version", "error");
        return;
      }
      const result = await requestPassphrase("import");
      if (!result) return;
      setBackupStage("downloading");
      try {
        const downloaded = await getConfigBackup(slot.deviceId);
        await importConfigFromEnvelope(downloaded.envelope, result.passphrase, setBackupStage);
        // Applied = the revision of the envelope actually restored, not the
        // list we showed earlier and not this phone's clock.
        if (slot.deviceId === WEB_SLOT_ID) markWebSlotApplied(downloaded.revision);
        try {
          await syncRememberedState(result);
        } catch (err) {
          console.warn("Failed to persist remembered passphrase", err);
        }
        toast("Configuration restored", "success");
        // Same follow-up as the file import (#168): re-confirm the home
        // network so local URLs come back, and say so if we stay away.
        void reevaluateHomeNetworkAfterImport().then(() => {
          const st = useConfigStore.getState();
          if (st.autoSwitchNetwork && st.networkAwayFromHome) {
            toast(
              "Services are using remote URLs until your home WiFi is confirmed. Open Settings → Network → Home Networks to finish setup.",
              "info",
            );
          }
        });
        void refreshSlots();
        if (!useBackendStore.getState().backupEnabled) {
          const passphrase = result.passphrase;
          afterProgressRef.current = () => flow.open("offerEnableAfterRestore", passphrase);
        }
      } catch (err) {
        toastError("Restore failed", err);
      } finally {
        setBackupStage(null);
      }
    },
    [flow, importConfigFromEnvelope, requestPassphrase, syncRememberedState, refreshSlots],
  );

  const applyWebSlot = useCallback(async () => {
    // Re-read so Apply acts on the newest web revision, not a stale list.
    let target = webSlot;
    try {
      const { backups } = await listConfigBackups();
      setSlots(backups);
      noteBackupList(backups);
      target = backups.find((s) => s.deviceId === WEB_SLOT_ID);
    } catch {
      /* fall back to what we have */
    }
    if (!target) {
      toast("The web configuration is no longer on the backend", "info");
      return;
    }
    flow.open("confirmRestore", [target]);
  }, [flow, webSlot]);

  const openManage = useCallback(async () => {
    try {
      const { backups } = await listConfigBackups();
      if (backups.length === 0) {
        toast("No backup on this backend yet", "info");
        return;
      }
      flow.open("manageSlots", backups);
    } catch (err) {
      toastError("Could not list backups", err);
    }
  }, [flow]);

  const performDeleteSlot = useCallback(
    async (slot: BackupMeta) => {
      try {
        await deleteConfigBackup(slot.deviceId);
        toast("Backup deleted", "success");
        void refreshSlots();
      } catch (err) {
        toastError("Could not delete backup", err);
      }
    },
    [refreshSlots],
  );

  useEffect(() => {
    if (mode === "scanning" && !permission?.granted) {
      void requestPermission();
    }
  }, [mode, permission, requestPermission]);

  // A successful claim latches `claimingRef` to block buffered native scans
  // from re-POSTing the already-claimed token. Releasing requires a real
  // "no longer paired" transition — unpair or rotate.
  useEffect(() => {
    if (!url) claimingRef.current = false;
  }, [url]);

  // Unpair and Rotate secret leave this screen mounted, so local state keeps
  // whatever it had (empty, when the user arrived already paired). Seed the URL
  // field from the draft `unpair()` preserved rather than making them retype
  // the address they were just using. Never overwrites something typed.
  useEffect(() => {
    if (url || !draftUrl) return;
    setBackendUrl((current) => current || draftUrl);
  }, [url, draftUrl]);

  return (
    <ScreenWrapper>
      <BackHeader title="Backend" right={<BackendStatusPill />} />

      {!projectReady && (
        <Card className="mb-4 bg-amber-950/40 border border-amber-900">
          <Text className="text-amber-300 text-sm">
            Push notifications require an EAS projectId. Replace the placeholder in
            app.config.ts and rebuild with EAS before pairing.
          </Text>
        </Card>
      )}

      {mode === "summary" && (
        <>
          <Card className="mb-4">
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Why a backend?
            </Text>
            <Text className="text-zinc-300 text-sm leading-5">
              Dashboarr normally only fires notifications while the app is open. Pair a self-hosted
              companion backend to get real push notifications on your lock screen even when the
              app is closed.
            </Text>
          </Card>

          {url ? (
            <>
              <Card className="gap-3 mb-4">
                <View className="flex-row items-center gap-2">
                  {isHealthy ? (
                    <Icon icon={Cloud} size={18} color="#22c55e" />
                  ) : (
                    <Icon icon={CloudOff} size={18} color="#f59e0b" />
                  )}
                  <Text className="text-zinc-100 text-base font-medium">
                    {isHealthy ? "Connected" : "Offline"}
                  </Text>
                </View>
                <Text className="text-zinc-500 text-xs break-all">{url}</Text>
                <Text className="text-zinc-600 text-xs">
                  {isHealthy
                    ? "Local notification watchers are paused while the backend is reachable."
                    : "Local notification watchers have resumed as a fallback."}
                </Text>
              </Card>

              <View className="flex-row gap-3 mb-3">
                <Button
                  label="Send test push"
                  onPress={handleTestPush}
                  loading={busy}
                  className="flex-1"
                />
              </View>

              <Card className="gap-3 mb-3">
                <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
                  Connection security
                </Text>
                <CertToggle
                  value={ignoreCertErrors}
                  onValueChange={(v) => void setIgnoreCertErrors(v)}
                />
              </Card>

              <Card className="gap-3 mb-3">
                <Toggle
                  label="Apprise notifications"
                  description="Also send to Discord, Telegram, ntfy, email… via an Apprise server"
                  value={appriseEnabled}
                  onValueChange={handleAppriseToggle}
                />
                {appriseEnabled ? (
                  <>
                    <TextInput
                      label="Apprise notify URL"
                      placeholder="http://192.168.1.50:8000/notify/dashboarr"
                      value={appriseUrl}
                      onChangeText={setAppriseUrl}
                      onBlur={handleAppriseUrlBlur}
                      keyboardType="url"
                      autoCapitalize="none"
                    />
                    <TextInput
                      label="Tags (optional)"
                      placeholder="phone,important"
                      value={appriseTags}
                      onChangeText={setAppriseTags}
                      onBlur={handleAppriseTagsBlur}
                      autoCapitalize="none"
                    />
                    <Text className="text-zinc-500 text-xs">
                      Add your notification services in the Apprise server's own config UI under a
                      key, then paste its full /notify/&lt;key&gt; URL here. Tags filter which saved
                      URLs fire (leave blank for all).
                    </Text>
                    <Button
                      label="Send Apprise test"
                      variant="outline"
                      onPress={handleAppriseTest}
                      loading={appriseBusy}
                      disabled={!appriseUrl.trim()}
                    />
                  </>
                ) : null}
              </Card>

              <Card className="gap-3 mb-3">
                <Toggle
                  label="Keep an encrypted backup on the backend"
                  description="Your whole configuration, encrypted on this phone with a passphrase you choose. The backend cannot read it. A new phone that pairs with this backend can restore it with the passphrase."
                  value={backupEnabled}
                  disabled={backupBusy || backupStage !== null || backupSupported === false}
                  onValueChange={(v) => {
                    if (v) void handleEnableBackup();
                    else flow.open("confirmDisableBackup");
                  }}
                />
                {backupSupported === false ? (
                  <Text className="text-amber-400 text-xs">
                    Update the backend to 1.6 or newer to use config backups.
                  </Text>
                ) : backupEnabled ? (
                  <Text className={lastBackupError ? "text-amber-400 text-xs" : "text-zinc-500 text-xs"}>
                    {lastBackupError
                      ? `Last backup failed: ${lastBackupError}`
                      : backupInFlight
                        ? "Uploading…"
                        : lastBackupAt
                          ? `Last backup ${formatTimeAgo(new Date(lastBackupAt).toISOString())}`
                          : "No backup uploaded yet"}
                  </Text>
                ) : null}
                {webSlotPending && webSlot ? (
                  <View className="bg-amber-950/60 border border-amber-900/60 rounded-xl px-3 py-2 flex-row items-center justify-between gap-3">
                    <View className="flex-1">
                      <Text className="text-amber-300 text-sm font-medium">Configuration edited on the web</Text>
                      <Text className="text-amber-200/70 text-xs">
                        {formatTimeAgo(new Date(webSlot.updatedAt).toISOString())} · replaces this phone's settings
                      </Text>
                    </View>
                    <Button label="Apply" onPress={() => void applyWebSlot()} disabled={backupBusy || backupStage !== null} />
                  </View>
                ) : null}
                <View className="flex-row gap-3">
                  <Button
                    label="Back up now"
                    onPress={handleBackupNow}
                    loading={backupBusy || backupInFlight}
                    disabled={!backupEnabled || backupStage !== null}
                    className="flex-1"
                  />
                  <Button
                    label="Restore…"
                    variant="outline"
                    onPress={() => void openRestore("button")}
                    disabled={backupBusy || backupStage !== null || backupSupported === false}
                    className="flex-1"
                  />
                </View>
                <Pressable
                  onPress={() => void openManage()}
                  disabled={backupBusy || backupStage !== null || backupSupported === false}
                  className="active:opacity-80"
                >
                  <View className="flex-row items-center justify-center gap-2 py-1">
                    <Icon icon={Trash2} size={14} color="#a1a1aa" />
                    <Text className="text-zinc-400 text-sm">Manage backend backups…</Text>
                  </View>
                </Pressable>
              </Card>

              <Pressable onPress={handleRotate} disabled={busy} className="active:opacity-80 mb-3">
                <Card className="flex-row items-center justify-center gap-2">
                  <Icon icon={RefreshCw} size={16} color="#a1a1aa" />
                  <Text className="text-zinc-200 text-base">Rotate secret</Text>
                </Card>
              </Pressable>

              <Pressable onPress={handleUnpair} disabled={busy} className="active:opacity-80">
                <Card className="flex-row items-center justify-center gap-2 bg-red-950/30 border border-red-900/50">
                  <Icon icon={Unlink} size={16} color="#f87171" />
                  <Text className="text-red-400 text-base">Unpair</Text>
                </Card>
              </Pressable>
            </>
          ) : (
            <>
              <Card className="mb-4">
                <TextInput
                  label="Backend URL"
                  placeholder="http://192.168.1.50:4000"
                  value={backendUrl}
                  onChangeText={setBackendUrl}
                  onBlur={() => {
                    // Commit on blur, like the Apprise fields above, so flipping
                    // the cert toggle allowlists this host even before a claim.
                    const normalized = normalizeServiceUrl(backendUrl);
                    setBackendUrl(normalized);
                    setDraftUrl(normalized || null);
                  }}
                  keyboardType="url"
                  autoCapitalize="none"
                />
                <Text className="text-zinc-500 text-xs mt-2">
                  Behind Cloudflare Tunnel or a reverse proxy? Enter the full https:// URL.
                </Text>
                <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mt-4">
                  Connection security
                </Text>
                <CertToggle
                  value={ignoreCertErrors}
                  onValueChange={(v) => void setIgnoreCertErrors(v)}
                />
              </Card>

              <Pressable
                onPress={() => setMode("scanning")}
                disabled={busy || !projectReady}
                className="active:opacity-80 mb-3"
              >
                <Card className="flex-row items-center justify-center gap-2">
                  <Icon icon={QrCode} size={18} color="#a1a1aa" />
                  <Text className="text-zinc-100 text-base">Scan pairing QR</Text>
                </Card>
              </Pressable>

              <Pressable
                onPress={() => setMode("manual")}
                disabled={busy || !projectReady || !backendUrl.trim()}
                className="active:opacity-80"
              >
                <Card className="flex-row items-center justify-center gap-2">
                  <Icon icon={Bell} size={18} color="#a1a1aa" />
                  <Text className="text-zinc-100 text-base">Enter token manually</Text>
                </Card>
              </Pressable>
            </>
          )}
        </>
      )}

      {mode === "scanning" && (
        <View className="flex-1">
          {permission?.granted ? (
            <View className="aspect-square rounded-2xl overflow-hidden bg-black mb-4">
              <CameraView
                style={{ flex: 1 }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={busy ? undefined : handleScan}
              />
              {busy && (
                <View className="absolute inset-0 items-center justify-center bg-black/60">
                  <ActivityIndicator size="large" color="#e4e4e7" />
                </View>
              )}
            </View>
          ) : (
            <Card className="mb-4">
              <Text className="text-zinc-300 text-sm">
                Camera permission is needed to scan the pairing QR.
              </Text>
              <Button label="Grant permission" onPress={() => requestPermission()} className="mt-3" />
            </Card>
          )}

          <Button label="Cancel" variant="outline" onPress={() => setMode("summary")} />
        </View>
      )}

      {mode === "manual" && (
        <>
          <Card className="gap-4 mb-4">
            <Text className="text-zinc-500 text-xs break-all">{backendUrl.trim()}</Text>
            <TextInput
              label="Pairing token"
              placeholder="hex token from backend logs"
              value={manualToken}
              onChangeText={setManualToken}
              autoCapitalize="none"
            />
            <CertToggle
              value={ignoreCertErrors}
              onValueChange={(v) => void setIgnoreCertErrors(v)}
            />
          </Card>

          <View className="flex-row gap-3">
            <Button
              label="Cancel"
              variant="outline"
              onPress={() => setMode("summary")}
              className="flex-1"
            />
            <Button label="Pair" onPress={handleManual} loading={busy} className="flex-1" />
          </View>
        </>
      )}

      <ConfirmModal
        {...flow.bind("confirmUnpair")}
        title="Unpair backend"
        message="This will stop push notifications from this backend. Continue?"
        icon={Unlink}
        tone="danger"
        confirmLabel="Unpair"
        onConfirm={() => {
          flow.close();
          void performUnpair();
        }}
      />

      <ConfirmModal
        {...flow.bind("confirmRotate")}
        title="Rotate backend secret"
        message="This unpairs the current shared secret. Scan a fresh pairing QR from your backend to get a new one. Push notifications will stop until you re-pair."
        icon={RefreshCw}
        tone="danger"
        confirmLabel="Rotate"
        onConfirm={() => {
          flow.close();
          void performRotate();
        }}
      />

      <ConfirmModal
        {...flow.bind("confirmDisableBackup")}
        title="Stop backing up to the backend"
        message="The backup key on this phone and this device's backup on the backend will be removed. Other devices' backups are not affected."
        icon={CloudUpload}
        tone="danger"
        confirmLabel="Stop"
        onConfirm={() => {
          flow.close();
          void performDisableBackup();
        }}
      />

      <ConfirmModal
        {...flow.bind("confirmRestore")}
        title="Restore configuration from backend"
        message={
          (flow.payload("confirmRestore")?.length ?? 0) > 1
            ? "A configuration backup is available on this backend. Restoring replaces every setting on this phone (services, dashboards, credentials). This phone stays paired. You will pick a backup and enter its passphrase next."
            : "A configuration backup is available on this backend. Restoring replaces every setting on this phone (services, dashboards, credentials). This phone stays paired. You will enter the backup passphrase next."
        }
        icon={CloudDownload}
        tone="danger"
        confirmLabel="Restore"
        onConfirm={() => {
          const slots = flow.payload("confirmRestore") ?? [];
          flow.close();
          flow.whenClear(() => {
            if (slots.length === 1) void restoreFromSlot(slots[0]);
            else flow.open("pickSlot", slots);
          });
        }}
      />

      <ActionSheet
        {...flow.bind("pickSlot")}
        title="Choose a backup"
        subtitle="Any device's backup, or the one edited on the backend's web UI, can be restored with its passphrase."
        actions={(flow.payload("pickSlot") ?? []).map((slot) => ({
          label: slotLabel(slot),
          subtitle: slotSubtitle(slot),
          icon: <Icon icon={CloudDownload} size={18} color="#a1a1aa" />,
          disabled: slot.configVersion > CURRENT_CONFIG_VERSION,
          onPress: () => void restoreFromSlot(slot),
        }))}
      />

      <ActionSheet
        {...flow.bind("manageSlots")}
        title="Backend backups"
        subtitle="Delete a backup slot. Unpaired slots belong to devices that rotated or unpaired."
        actions={(flow.payload("manageSlots") ?? []).map((slot) => ({
          label: `Delete ${slotLabel(slot).toLowerCase()}`,
          subtitle: slotSubtitle(slot),
          icon: <Icon icon={Trash2} size={18} color="#f87171" />,
          variant: "danger" as const,
          onPress: () => flow.open("confirmDeleteSlot", slot),
        }))}
      />

      <ConfirmModal
        {...flow.bind("confirmDeleteSlot")}
        title="Delete backup"
        message={`Delete the backup from ${flow.payload("confirmDeleteSlot") ? slotLabel(flow.payload("confirmDeleteSlot")!).toLowerCase() : "this device"}? This cannot be undone.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => {
          const slot = flow.payload("confirmDeleteSlot");
          flow.close();
          if (slot) void performDeleteSlot(slot);
        }}
      />

      <ConfirmModal
        {...flow.bind("offerEnableAfterRestore")}
        title="Keep this phone backed up too?"
        message="Changes made on this phone will be encrypted with the same passphrase and uploaded to the backend, so every paired phone can restore the latest configuration."
        icon={CloudUpload}
        confirmLabel="Enable"
        cancelLabel="Not now"
        onConfirm={() => {
          const passphrase = flow.payload("offerEnableAfterRestore");
          flow.close();
          flow.whenClear(() => {
            if (!passphrase) return;
            void (async () => {
              try {
                if ((await requireDeviceAuth("Authenticate to enable backend backup")) === "cancelled") return;
                await enableBackupWith(passphrase);
              } catch (err) {
                toastError("Could not enable backup", err);
              }
            })();
          });
        }}
      />

      <PassphrasePrompt
        visible={flow.isOpen("passphrase")}
        mode={flow.payload("passphrase")?.mode ?? "import"}
        hasRemembered={hasRemembered}
        onUseRemembered={useRemembered}
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

      <ProgressModal
        visible={backupStage !== null}
        title={backupStage ? BACKUP_STAGE_COPY[backupStage].title : ""}
        subtitle={backupStage ? BACKUP_STAGE_COPY[backupStage].subtitle : undefined}
        onClosed={() => {
          const next = afterProgressRef.current;
          afterProgressRef.current = null;
          next?.();
        }}
      />
    </ScreenWrapper>
  );
}
