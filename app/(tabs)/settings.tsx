import { useCallback, useState } from "react";
import { View, Text, Alert, BackHandler, Pressable, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { toast } from "@/components/ui/toast";
import {
  Upload,
  FolderDown,
  Wifi,
  Cloud,
  Zap,
  ImageOff,
  Globe,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Copy,
  Github,
  Bug,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ServiceLogo } from "@/components/ui/service-logo";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { useConfigStore } from "@/store/config-store";
import { useBackendStore } from "@/store/backend-store";
import type { ExportStage, ImportStage } from "@/store/config-store";
import { useNotificationStore } from "@/store/notifications-store";
import { ProgressModal } from "@/components/common/progress-modal";
import { BackHeader } from "@/components/common/back-header";
import { pingService } from "@/lib/http-client";
import { qbClearSession } from "@/services/qbittorrent-api";
import { SERVICE_IDS, SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { validateServiceUrl } from "@/lib/url-validation";
import { brrrHaptic } from "@/lib/haptics";
import { AppVersionCard } from "@/components/common/app-version-card";
import {
  NATIVE_VERSION,
  RUNTIME_VERSION,
  UPDATE_CHANNEL,
  getCurrentUpdateId,
} from "@/lib/app-version";
import { PassphrasePrompt } from "@/components/common/passphrase-prompt";
import type { PassphraseMode, PassphraseResult } from "@/components/common/passphrase-prompt";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import {
  forgetRememberedPassphrase,
  hasRememberedPassphrase,
  loadRememberedPassphrase,
  saveRememberedPassphrase,
} from "@/lib/config-passphrase";

// Service kinds whose backend webhook integration uses ?instance=<uuid> to
// attribute events to a specific instance. Other kinds (qbittorrent, prowlarr,
// plex, jellyfin, glances) don't have a webhook integration, so the
// instance-id helper card is hidden for them.
const WEBHOOK_KINDS = new Set<ServiceId>([
  "radarr",
  "sonarr",
  "tautulli",
  "overseerr",
  "bazarr",
]);

// Display name for the service kind (used in the main settings list, before
// the user picks an instance). Each instance also carries its own editable
// `name`, but the kind row needs a stable label.
const SERVICE_DEFAULTS_KIND_LABEL: Record<ServiceId, string> = SERVICE_IDS.reduce(
  (acc, id) => {
    acc[id] = SERVICE_DEFAULTS[id].name;
    return acc;
  },
  {} as Record<ServiceId, string>,
);

// Uses GitHub's `?body=` query param (URL-encoded) to pre-fill the new-issue form.
function buildIssueUrl(): string {
  const updateId = getCurrentUpdateId() ?? "embedded";
  const lines = [
    "## Describe the issue",
    "",
    "",
    "## Steps to reproduce",
    "",
    "",
    "## Expected behavior",
    "",
    "",
    "---",
    "**Environment** (auto-filled — please keep)",
    `- App version: ${NATIVE_VERSION}`,
    `- Runtime: ${RUNTIME_VERSION}`,
    `- Update: ${updateId}`,
    ...(UPDATE_CHANNEL ? [`- Channel: ${UPDATE_CHANNEL}`] : []),
    `- Platform: ${Platform.OS} ${String(Platform.Version)}`,
  ];
  const body = encodeURIComponent(lines.join("\n"));
  return `https://github.com/renzobeux/Dashboarr/issues/new?body=${body}`;
}

// Module-level singletons for the "absent" case in store selectors. Returning
// `?? []` or `?? {}` from inside a Zustand selector creates a fresh reference
// on every store update, which Zustand reads as "value changed" and triggers
// a re-render — and if the consumer is a `useState`-bearing form like
// ServiceEditor, that re-render kicks the selector again, etc., until React
// throws "Maximum update depth exceeded". Using a stable empty value keeps
// the selector idempotent across non-mutating store updates.
const EMPTY_INSTANCES: import("@/store/config-store").ServiceInstance[] = [];
const EMPTY_SECRETS: import("@/store/config-store").ServiceSecrets = {};

export default function SettingsScreen() {
  // Multi-instance settings has three views:
  //   • main: list of service kinds with instance counts
  //   • viewingService: list of instances for one kind (with add/edit/delete)
  //   • editingInstance: per-instance editor (URL/auth/name/delete)
  const [viewingService, setViewingService] = useState<ServiceId | null>(null);
  const [editingInstance, setEditingInstance] = useState<{
    serviceId: ServiceId;
    instanceId: string;
  } | null>(null);
  const [exportStage, setExportStage] = useState<ExportStage | null>(null);
  const [importStage, setImportStage] = useState<ImportStage | null>(null);
  const [passphraseRequest, setPassphraseRequest] = useState<{
    mode: PassphraseMode;
    resolve: (value: PassphraseResult | null) => void;
  } | null>(null);
  const [hasRemembered, setHasRemembered] = useState(() => hasRememberedPassphrase());
  const [confirmClearCache, setConfirmClearCache] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);

  const requestPassphrase = (mode: PassphraseMode) =>
    new Promise<PassphraseResult | null>((resolve) => {
      setPassphraseRequest({ mode, resolve });
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

  const serviceInstances = useConfigStore((s) => s.serviceInstances);
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeNetworksCount = useConfigStore((s) => s.homeNetworks.length);
  const setAutoSwitch = useConfigStore((s) => s.setAutoSwitch);
  const exportConfig = useConfigStore((s) => s.exportConfig);
  const importConfig = useConfigStore((s) => s.importConfig);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const globalHeaderCount = useConfigStore(
    (s) => Object.keys(s.globalCustomHeaders).length,
  );
  const demoMode = useConfigStore((s) => s.demoMode);
  const enableDemoMode = useConfigStore((s) => s.enableDemoMode);
  const disableDemoMode = useConfigStore((s) => s.disableDemoMode);
  const hapticsEnabled = useConfigStore((s) => s.hapticsEnabled);
  const setHapticsEnabled = useConfigStore((s) => s.setHapticsEnabled);
  const uiScale = useConfigStore((s) => s.uiScale);
  const setUiScale = useConfigStore((s) => s.setUiScale);

  const notifEnabled = useNotificationStore((s) => s.enabled);
  const torrentCompleted = useNotificationStore((s) => s.torrentCompleted);
  const radarrDownloaded = useNotificationStore((s) => s.radarrDownloaded);
  const sonarrDownloaded = useNotificationStore((s) => s.sonarrDownloaded);
  const serviceOffline = useNotificationStore((s) => s.serviceOffline);
  const overseerrNewRequest = useNotificationStore((s) => s.overseerrNewRequest);
  const setNotifSetting = useNotificationStore((s) => s.setSetting);

  const handleExport = async () => {
    const result = await requestPassphrase("export");
    if (!result) return;
    try {
      await exportConfig(result.passphrase, setExportStage);
      await syncRememberedState(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to export config";
      toast(msg, "error");
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
    setConfirmClearCache(false);
    try {
      await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
      toast("Image cache cleared", "success");
    } catch {
      toast("Failed to clear image cache", "error");
    }
  };

  const performImport = async () => {
    setConfirmImport(false);
    // iOS won't present a new modal (the document picker) while another
    // is still animating away — it silently fails and the picker never
    // opens. Wait for the ConfirmModal fade-out before continuing.
    if (Platform.OS === "ios") {
      await new Promise<void>((resolve) => setTimeout(resolve, 350));
    }
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
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Invalid config file";
      toast(msg, "error");
    } finally {
      setImportStage(null);
    }
  };

  if (editingInstance) {
    return (
      <ServiceEditor
        serviceId={editingInstance.serviceId}
        instanceId={editingInstance.instanceId}
        onBack={() => setEditingInstance(null)}
        onDeleted={() => setEditingInstance(null)}
      />
    );
  }

  if (viewingService) {
    return (
      <InstanceList
        serviceId={viewingService}
        onBack={() => setViewingService(null)}
        onEditInstance={(instanceId) =>
          setEditingInstance({ serviceId: viewingService, instanceId })
        }
      />
    );
  }

  const renderKindRow = (id: ServiceId) => {
    const list = serviceInstances[id] ?? [];
    const enabledCount = list.filter((i) => i.enabled).length;
    const subtitle =
      list.length === 0
        ? "Tap to add"
        : list.length === 1
          ? list[0].enabled
            ? list[0].useRemote
              ? list[0].remoteUrl || "No remote URL"
              : list[0].localUrl || "No local URL"
            : "Tap to configure"
          : `${list.length} instances · ${enabledCount} enabled`;
    return (
      <SettingsRow
        key={id}
        leading={<ServiceLogo id={id} size={20} />}
        label={SERVICE_DEFAULTS_KIND_LABEL[id]}
        subtitle={subtitle}
        onPress={() => setViewingService(id)}
        right={
          enabledCount > 0 ? (
            <View className="w-2 h-2 rounded-full bg-success" />
          ) : null
        }
      />
    );
  };

  // Determine ordering: kinds with at least one enabled instance come first,
  // matching the v12 "configured at top" UX.
  const enabledKinds = SERVICE_IDS.filter((id) =>
    (serviceInstances[id] ?? []).some((i) => i.enabled),
  );
  const disabledKinds = SERVICE_IDS.filter(
    (id) => !(serviceInstances[id] ?? []).some((i) => i.enabled),
  );

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-2xl font-bold mt-2 mb-4">
        Settings
      </Text>

      <SettingsGroup title="Services">
        {enabledKinds.map(renderKindRow)}
        {disabledKinds.length > 0 && enabledKinds.length > 0 ? (
          <View className="px-4 py-2 bg-surface-light/30">
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
              Not configured
            </Text>
          </View>
        ) : null}
        {disabledKinds.map(renderKindRow)}
      </SettingsGroup>

      <SettingsGroup title="Network">
        <SettingsToggleRow
          label="Auto-switch network"
          description="Use local URLs on home WiFi, remote otherwise"
          value={autoSwitchNetwork}
          onValueChange={setAutoSwitch}
        />
        <SettingsRow
          icon={Wifi}
          label="Home Networks"
          subtitle={
            autoSwitchNetwork && homeNetworksCount === 0
              ? "Add at least one to enable auto-switching"
              : homeNetworksCount > 0
                ? `${homeNetworksCount} network${homeNetworksCount > 1 ? "s" : ""} configured`
                : "Configure your home WiFi networks"
          }
          subtitleTone={
            autoSwitchNetwork && homeNetworksCount === 0 ? "warn" : "default"
          }
          onPress={() => router.push("/home-networks")}
        />
        <SettingsRow
          icon={Zap}
          label="Wake-on-LAN"
          subtitle={
            wolDevices.length
              ? `${wolDevices.length} device${wolDevices.length > 1 ? "s" : ""} configured`
              : "Wake devices on your network"
          }
          onPress={() => router.push("/wake-on-lan")}
        />
        <SettingsRow
          icon={Globe}
          label="Custom Headers"
          subtitle={
            globalHeaderCount > 0
              ? `${globalHeaderCount} header${globalHeaderCount > 1 ? "s" : ""} sent on every request`
              : "Add headers for reverse-proxy auth"
          }
          onPress={() => router.push("/custom-headers")}
        />
      </SettingsGroup>

      <SettingsGroup title="Notifications">
        <SettingsToggleRow
          label="Local alerts"
          description="Fire banners when Dashboarr is open"
          value={notifEnabled}
          onValueChange={(v) => setNotifSetting("enabled", v)}
        />
        {notifEnabled ? (
          <SettingsToggleRow
            label="Torrent completed"
            value={torrentCompleted}
            onValueChange={(v) => setNotifSetting("torrentCompleted", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Movie downloaded"
            value={radarrDownloaded}
            onValueChange={(v) => setNotifSetting("radarrDownloaded", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Episode downloaded"
            value={sonarrDownloaded}
            onValueChange={(v) => setNotifSetting("sonarrDownloaded", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="Service offline"
            value={serviceOffline}
            onValueChange={(v) => setNotifSetting("serviceOffline", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="New Seerr request"
            value={overseerrNewRequest}
            onValueChange={(v) => setNotifSetting("overseerrNewRequest", v)}
          />
        ) : null}
        <SettingsRow
          icon={Cloud}
          label="Backend"
          subtitle="Self-host for real push notifications when the app is closed"
          onPress={() => router.push("/backend")}
          right={<BackendStatusPill />}
        />
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <View className="px-4 py-3">
          <Select<number>
            label="UI Scale"
            value={uiScale}
            options={[
              { value: 1, label: "Normal", description: "Default size" },
              { value: 1.15, label: "Large", description: "+15% fonts, spacing, and icons" },
              { value: 1.3, label: "Extra Large", description: "+30% fonts, spacing, and icons" },
            ]}
            onChange={(v) => setUiScale(v as 1 | 1.15 | 1.3)}
          />
        </View>
        <SettingsToggleRow
          label="Haptic feedback"
          description="Vibrations on taps, toggles, and refreshes"
          value={hapticsEnabled}
          onValueChange={(v) => {
            setHapticsEnabled(v);
            if (v) brrrHaptic();
          }}
        />
      </SettingsGroup>

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
          onPress={() => setConfirmImport(true)}
          disabled={importStage !== null}
        />
        <SettingsRow
          icon={ImageOff}
          label="Clear image cache"
          subtitle="Free up disk space used by cached posters and backdrops"
          onPress={() => setConfirmClearCache(true)}
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

      <SettingsGroup
        title="About"
        footer="Dashboarr is open-source under GPL-3.0. Contributions and bug reports are welcome."
      >
        <SettingsRow
          icon={Github}
          label="View on GitHub"
          subtitle="github.com/renzobeux/Dashboarr"
          onPress={() => void Linking.openURL("https://github.com/renzobeux/Dashboarr")}
        />
        <SettingsRow
          icon={Bug}
          label="Report an issue"
          subtitle="Open a new issue on GitHub"
          onPress={() => void Linking.openURL(buildIssueUrl())}
        />
      </SettingsGroup>

      <AppVersionCard />

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
        visible={confirmClearCache}
        title="Clear image cache"
        message="Posters and backdrops will be re-downloaded the next time you view them."
        icon={ImageOff}
        tone="danger"
        confirmLabel="Clear"
        onConfirm={() => void performClearImageCache()}
        onCancel={() => setConfirmClearCache(false)}
      />

      <ConfirmModal
        visible={confirmImport}
        title="Import settings"
        message="This will overwrite all current settings with the imported configuration. Continue?"
        icon={FolderDown}
        tone="danger"
        confirmLabel="Import"
        onConfirm={() => void performImport()}
        onCancel={() => setConfirmImport(false)}
      />

      <PassphrasePrompt
        visible={!!passphraseRequest}
        mode={passphraseRequest?.mode ?? "import"}
        hasRemembered={hasRemembered}
        onUseRemembered={async () => {
          const saved = await loadRememberedPassphrase();
          if (!saved) setHasRemembered(false);
          return saved;
        }}
        onSubmit={(result) => {
          passphraseRequest?.resolve(result);
          setPassphraseRequest(null);
        }}
        onCancel={() => {
          passphraseRequest?.resolve(null);
          setPassphraseRequest(null);
        }}
      />
    </ScreenWrapper>
  );
}

function InstanceList({
  serviceId,
  onBack,
  onEditInstance,
}: {
  serviceId: ServiceId;
  onBack: () => void;
  onEditInstance: (instanceId: string) => void;
}) {
  const instances = useConfigStore(
    (s) => s.serviceInstances[serviceId] ?? EMPTY_INSTANCES,
  );
  const activeId = useConfigStore((s) => s.activeInstance[serviceId]);
  const addInstance = useConfigStore((s) => s.addInstance);
  const removeInstance = useConfigStore((s) => s.removeInstance);
  const moveInstance = useConfigStore((s) => s.moveInstance);
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  const kindLabel = SERVICE_DEFAULTS_KIND_LABEL[serviceId];

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleAdd = () => {
    // First instance for a kind takes the kind's default name; subsequent ones
    // are auto-numbered to a unique label so the user has something to edit
    // rather than a blank field.
    const existing = instances.length;
    const defaultName =
      existing === 0 ? kindLabel : `${kindLabel} ${existing + 1}`;
    const inst = addInstance(serviceId, { name: defaultName });
    onEditInstance(inst.id);
  };

  const performDelete = async (instanceId: string) => {
    setConfirmDelete(null);
    if (serviceId === "qbittorrent") {
      // Drop any cached qBit session for the deleted instance before its
      // SecureStore row goes away.
      await qbClearSession(instanceId);
    }
    await removeInstance(serviceId, instanceId);
  };

  return (
    <ScreenWrapper>
      <BackHeader title={kindLabel} onBack={onBack} />

      <SettingsGroup
        title={instances.length === 1 ? "Instance" : "Instances"}
        footer={
          instances.length > 1
            ? "Tap an instance to edit. Use the arrows to reorder — the order here is the order shown in the per-tab switcher."
            : undefined
        }
      >
        {instances.map((inst, idx) => {
          const subtitle = inst.enabled
            ? inst.useRemote
              ? inst.remoteUrl || "No remote URL"
              : inst.localUrl || "No local URL"
            : "Disabled";
          const isActive = inst.id === activeId;
          return (
            <View
              key={inst.id}
              className="flex-row items-center border-b border-surface-light last:border-b-0"
            >
              <Pressable
                onPress={() => onEditInstance(inst.id)}
                className="flex-1 flex-row items-center px-4 py-3 active:opacity-70"
              >
                <View className="flex-1">
                  <View className="flex-row items-center gap-2">
                    <Text className="text-zinc-100 text-base">{inst.name}</Text>
                    {isActive && instances.length > 1 ? (
                      <Text className="text-primary text-xs">• active</Text>
                    ) : null}
                  </View>
                  <Text className="text-zinc-500 text-xs">{subtitle}</Text>
                </View>
                {inst.enabled ? (
                  <View className="w-2 h-2 rounded-full bg-success mr-2" />
                ) : null}
              </Pressable>
              {instances.length > 1 ? (
                <View className="flex-row items-center pr-2">
                  <Pressable
                    onPress={() => moveInstance(serviceId, inst.id, "up")}
                    disabled={idx === 0}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: idx === 0 ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowUp} size={16} color="#a1a1aa" />
                  </Pressable>
                  <Pressable
                    onPress={() => moveInstance(serviceId, inst.id, "down")}
                    disabled={idx === instances.length - 1}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                    style={{ opacity: idx === instances.length - 1 ? 0.3 : 1 }}
                  >
                    <Icon icon={ArrowDown} size={16} color="#a1a1aa" />
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmDelete(inst.id)}
                    hitSlop={6}
                    className="p-2 active:opacity-60"
                  >
                    <Icon icon={Trash2} size={16} color="#f87171" />
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
        <SettingsRow
          icon={Plus}
          label={instances.length === 0 ? `Add ${kindLabel}` : `Add another instance`}
          subtitle={
            instances.length > 0
              ? "Configure a second server of this kind"
              : undefined
          }
          onPress={handleAdd}
        />
        {instances.length > 1 ? (
          <View className="px-4 py-3 border-t border-surface-light">
            <Text className="text-zinc-500 text-xs mb-2">
              Active instance (used by tabs and notifications)
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {instances
                .filter((i) => i.enabled)
                .map((inst) => (
                  <Pressable
                    key={inst.id}
                    onPress={() => setActiveInstance(serviceId, inst.id)}
                    className={`px-3 py-1.5 rounded-full ${
                      inst.id === activeId ? "bg-primary" : "bg-surface-light"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        inst.id === activeId ? "text-white" : "text-zinc-400"
                      }`}
                    >
                      {inst.name}
                    </Text>
                  </Pressable>
                ))}
            </View>
          </View>
        ) : null}
      </SettingsGroup>

      <ConfirmModal
        visible={confirmDelete !== null}
        title="Delete instance"
        message={
          confirmDelete
            ? `This will remove "${
                instances.find((i) => i.id === confirmDelete)?.name ?? "this instance"
              }" and its credentials. This cannot be undone.`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && void performDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </ScreenWrapper>
  );
}

function ServiceEditor({
  serviceId,
  instanceId,
  onBack,
  onDeleted,
}: {
  serviceId: ServiceId;
  instanceId: string;
  onBack: () => void;
  onDeleted: () => void;
}) {
  // The instance row is read directly off the multi-instance state. If the
  // user deleted this instance from elsewhere mid-edit, we surface a
  // not-found state instead of crashing on `.localUrl` of undefined.
  const inst = useConfigStore((s) =>
    (s.serviceInstances[serviceId] ?? EMPTY_INSTANCES).find((i) => i.id === instanceId),
  );
  const secrets = useConfigStore(
    (s) => s.instanceSecrets[instanceId] ?? EMPTY_SECRETS,
  );
  const instancesForKind = useConfigStore(
    (s) => s.serviceInstances[serviceId] ?? EMPTY_INSTANCES,
  );
  const updateInstance = useConfigStore((s) => s.updateInstance);
  const updateInstanceSecrets = useConfigStore((s) => s.updateInstanceSecrets);
  const toggleInstance = useConfigStore((s) => s.toggleInstance);
  const removeInstance = useConfigStore((s) => s.removeInstance);

  const config = inst ?? {
    enabled: false,
    name: SERVICE_DEFAULTS_KIND_LABEL[serviceId],
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
  };

  const [name, setName] = useState(config.name);
  const [localUrl, setLocalUrl] = useState(config.localUrl);
  const [remoteUrl, setRemoteUrl] = useState(config.remoteUrl);
  const [apiKey, setApiKey] = useState(secrets.apiKey ?? "");
  const [username, setUsername] = useState(secrets.username ?? "");
  const [password, setPassword] = useState(secrets.password ?? "");
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(
    secrets.customHeaders ?? {},
  );
  const [testing, setTesting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isQB = serviceId === "qbittorrent" || serviceId === "glances";

  const headersJson = JSON.stringify(customHeaders);
  const savedHeadersJson = JSON.stringify(secrets.customHeaders ?? {});

  const isDirty =
    name !== config.name ||
    localUrl !== config.localUrl ||
    remoteUrl !== config.remoteUrl ||
    headersJson !== savedHeadersJson ||
    (isQB
      ? username !== (secrets.username ?? "") || password !== (secrets.password ?? "")
      : apiKey !== (secrets.apiKey ?? ""));

  const handleBack = () => {
    if (!isDirty) {
      onBack();
      return;
    }
    Alert.alert(
      "Unsaved changes",
      "Your URL or credentials haven't been saved. What would you like to do?",
      [
        { text: "Keep editing", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: onBack },
        { text: "Save", onPress: () => void handleSave() },
      ],
    );
  };

  // Intercept Android hardware back / swipe-back so it closes the editor
  // (with the unsaved-changes guard) instead of popping the Settings tab.
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        handleBack();
        return true;
      });
      return () => sub.remove();
    }, [handleBack]),
  );

  const confirmHttpWarning = (message: string) =>
    new Promise<boolean>((resolve) => {
      Alert.alert("Remote URL uses HTTP", message, [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        { text: "Save anyway", style: "destructive", onPress: () => resolve(true) },
      ]);
    });

  const handleSave = async () => {
    if (!inst) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Name cannot be empty", "error");
      return;
    }
    const localResult = validateServiceUrl(localUrl, "local");
    if (localResult.kind === "invalid") {
      toast(localResult.message, "error");
      return;
    }
    const remoteResult = validateServiceUrl(remoteUrl, "remote");
    if (remoteResult.kind === "invalid") {
      toast(remoteResult.message, "error");
      return;
    }
    if (remoteResult.kind === "warn") {
      const confirmed = await confirmHttpWarning(remoteResult.message);
      if (!confirmed) return;
    }

    // Mirror the schema validator so the user can't save an invalid header
    // map and then have hydrate() silently drop it after a restart.
    const headerNameRe = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
    for (const [name, val] of Object.entries(customHeaders)) {
      if (!headerNameRe.test(name)) {
        toast(`Invalid header name: "${name}"`, "error");
        return;
      }
      if (/[\r\n]/.test(val)) {
        toast(`Header "${name}" value contains newlines`, "error");
        return;
      }
    }

    updateInstance(serviceId, instanceId, {
      name: trimmedName,
      localUrl,
      remoteUrl,
    });
    if (isQB) {
      await updateInstanceSecrets(instanceId, {
        username,
        password,
        customHeaders,
      });
    } else {
      await updateInstanceSecrets(instanceId, { apiKey, customHeaders });
    }
    // Drop the cached qBittorrent SID so the next request re-logs in with the
    // new URL or credentials. (glances reuses isQB for its u/p form but has
    // no session to clear.)
    if (serviceId === "qbittorrent") {
      await qbClearSession(instanceId);
    }
    onBack();
  };

  const handleTest = async () => {
    setTesting(true);
    const testUrl = config.useRemote ? remoteUrl : localUrl;
    const responseTime = await pingService(serviceId, testUrl || undefined, instanceId);
    setTesting(false);

    if (responseTime !== null) {
      toast(`Connected in ${responseTime}ms`, "success");
    } else {
      toast("Could not reach service. Check URL and network.", "error");
    }
  };

  const performDelete = async () => {
    setConfirmDelete(false);
    if (serviceId === "qbittorrent") {
      await qbClearSession(instanceId);
    }
    await removeInstance(serviceId, instanceId);
    onDeleted();
  };

  if (!inst) {
    // Edge case: instance was deleted while the editor was still mounted.
    return (
      <ScreenWrapper>
        <BackHeader title="Not found" onBack={onBack} />
        <Text className="text-zinc-400 text-sm">
          This instance no longer exists. Tap back to return.
        </Text>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <BackHeader
        title={config.name}
        onBack={handleBack}
        right={
          isDirty ? (
            <Text className="text-amber-400 text-xs">• unsaved</Text>
          ) : null
        }
      />

      <Card className="gap-4 mb-4">
        <TextInput
          label="Name"
          placeholder={SERVICE_DEFAULTS_KIND_LABEL[serviceId]}
          value={name}
          onChangeText={setName}
        />
        <Toggle
          label="Enabled"
          value={config.enabled}
          onValueChange={() => toggleInstance(serviceId, instanceId)}
        />
      </Card>

      <Card className="gap-4 mb-4">
        <TextInput
          label="Local URL"
          placeholder="http://192.168.1.100:8080"
          value={localUrl}
          onChangeText={setLocalUrl}
          keyboardType="url"
        />
        <TextInput
          label="Remote URL"
          placeholder="https://service.mydomain.com"
          value={remoteUrl}
          onChangeText={setRemoteUrl}
          keyboardType="url"
        />
        <Toggle
          label="Use Remote URL"
          value={config.useRemote}
          onValueChange={(v) =>
            updateInstance(serviceId, instanceId, { useRemote: v })
          }
        />
      </Card>

      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Authentication
        </Text>
        {isQB ? (
          <>
            <TextInput
              label="Username"
              placeholder="admin"
              value={username}
              onChangeText={setUsername}
            />
            <TextInput
              label="Password"
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </>
        ) : (
          <TextInput
            label="API Key"
            placeholder="Enter API key"
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
          />
        )}
      </Card>

      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Custom Headers
        </Text>
        <HeaderListEditor
          value={customHeaders}
          onChange={setCustomHeaders}
          helperText="Sent on every request to this instance. Combined with the global headers (Settings → Custom Headers). The service's own auth (API Key, Plex Token, etc.) always wins on collision."
        />
      </Card>

      <WebhookInstanceIdCard serviceId={serviceId} instanceId={instanceId} />

      <View className="flex-row gap-3 mb-4">
        <Button
          label="Test Connection"
          onPress={handleTest}
          variant="outline"
          loading={testing}
          className="flex-1"
        />
        <Button label="Save" onPress={handleSave} className="flex-1" />
      </View>

      {/* Delete is only offered when the user has more than one instance of this
          kind — kinds always carry at least one slot, so removing the only
          instance would leave the kind in an unpopulated state and force the
          user to re-create it. Better to let them disable instead. */}
      {instancesForKind.length > 1 ? (
        <Button
          label="Delete instance"
          onPress={() => setConfirmDelete(true)}
          variant="outline"
        />
      ) : null}

      <ConfirmModal
        visible={confirmDelete}
        title="Delete instance"
        message={`This will remove "${config.name}" and its credentials. This cannot be undone.`}
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={() => void performDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </ScreenWrapper>
  );
}

/**
 * Read-only display of the instance UUID for webhook attribution. The user
 * appends `?instance=<id>` to the webhook URL they paste into Radarr/Sonarr/
 * etc., and the backend uses that to tag pushes with the instance name (e.g.
 * "Radarr Seedbox: Movie X downloaded"). Hidden for kinds without a webhook
 * integration, and hidden when no backend is paired (the id has no use
 * standalone).
 */
function WebhookInstanceIdCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  const backendUrl = useBackendStore((s) => s.url);

  if (!WEBHOOK_KINDS.has(serviceId)) return null;
  if (!backendUrl) return null;

  const handleCopy = async () => {
    await Clipboard.setStringAsync(instanceId);
    brrrHaptic();
    toast("Instance ID copied", "success");
  };

  return (
    <Card className="gap-3 mb-4">
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Webhook Attribution
      </Text>
      <Text className="text-zinc-400 text-xs leading-5">
        Append <Text className="text-zinc-200">?instance=&lt;id&gt;</Text> to your
        backend webhook URL in this service's notification settings so push
        notifications can be tagged with this instance's name. Optional —
        without it, pushes still arrive but aren't attributed.
      </Text>
      <Pressable
        onPress={() => void handleCopy()}
        className="flex-row items-center justify-between bg-surface-light rounded-xl p-3 active:opacity-70"
      >
        <Text
          className="text-zinc-200 text-xs flex-1 mr-3"
          numberOfLines={1}
          ellipsizeMode="middle"
          selectable
        >
          {instanceId}
        </Text>
        <Icon icon={Copy} size={16} color="#a1a1aa" />
      </Pressable>
    </Card>
  );
}
