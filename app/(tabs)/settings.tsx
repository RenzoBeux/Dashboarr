import { useCallback, useRef, useState } from "react";
import { View, Text, BackHandler, Pressable, Linking, Platform } from "react-native";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { toast, toastError } from "@/components/ui/toast";
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
  Bug,
  Heart,
  BookOpen,
} from "lucide-react-native";
import GithubLogo from "@/assets/services/github.svg";
import { useUiScale } from "@/hooks/use-ui-scale";
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
import { useIntroStore } from "@/store/intro-store";
import type { ExportStage, ImportStage } from "@/store/config-store";
import { ProgressModal } from "@/components/common/progress-modal";
import { BackHeader } from "@/components/common/back-header";
import { testServiceConnection } from "@/lib/http-client";
import { useServiceHealth } from "@/hooks/use-service-health";
import type { HealthStatusKind } from "@/lib/types";

// Same green/orange/red palette as the dashboard service-health card and the
// Services tab — kept in sync so the indicator means the same thing across
// every surface that shows a per-instance status dot.
const DOT_BG: Record<HealthStatusKind, string> = {
  ok: "bg-success",
  auth_failed: "bg-warning",
  offline: "bg-danger",
};
import { qbClearSession } from "@/services/qbittorrent-api";
import { SERVICE_IDS, SERVICE_DEFAULTS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import {
  CATEGORIES_FOR_KIND,
  CATEGORY_LABELS,
  type NotifCategory,
} from "@/lib/notification-categories";
import { validateServiceUrl, normalizeServiceUrl } from "@/lib/url-validation";
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
import { ActionSheet } from "@/components/ui/action-sheet";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { AddToDashboardsSheet } from "@/components/dashboard/add-to-dashboards-sheet";
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
    isNew?: boolean;
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
  const replayWorkspaceIntro = useIntroStore((s) => s.replayWorkspaceIntro);

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

  // GitHub logo is an SVG (lucide v1 dropped brand icons), so size it manually
  // to match the lucide icons in other rows (size=20 with rem scale).
  const scale = useUiScale();
  const githubLogoSize = Math.round(20 * scale);

  // Pull live health for every (kind, instance) pair so the kind-row dots can
  // reflect ok/auth_failed/offline instead of just "any instance enabled".
  // Cached + polled by the shared hook — no extra requests fired here.
  const { data: healthData } = useServiceHealth();

  const notifEnabled = useConfigStore((s) => s.notificationSettings.enabled);
  const torrentCompleted = useConfigStore((s) => s.notificationSettings.torrentCompleted);
  const sabnzbdCompleted = useConfigStore((s) => s.notificationSettings.sabnzbdCompleted);
  const nzbgetCompleted = useConfigStore((s) => s.notificationSettings.nzbgetCompleted);
  const radarrDownloaded = useConfigStore((s) => s.notificationSettings.radarrDownloaded);
  const sonarrDownloaded = useConfigStore((s) => s.notificationSettings.sonarrDownloaded);
  const serviceOffline = useConfigStore((s) => s.notificationSettings.serviceOffline);
  const overseerrNewRequest = useConfigStore((s) => s.notificationSettings.overseerrNewRequest);
  const setNotifSetting = useConfigStore((s) => s.setNotificationSetting);

  const handleExport = async () => {
    const result = await requestPassphrase("export");
    if (!result) return;
    try {
      await exportConfig(result.passphrase, setExportStage);
      await syncRememberedState(result);
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
    setConfirmClearCache(false);
    try {
      await Promise.all([Image.clearMemoryCache(), Image.clearDiskCache()]);
      toast("Image cache cleared", "success");
    } catch (err) {
      toastError("Failed to clear image cache", err);
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
      toastError("Invalid config file", e);
    } finally {
      setImportStage(null);
    }
  };

  if (editingInstance) {
    return (
      // Key by instance id so the editor fully remounts when switching between
      // instances. The form seeds its URL/credential fields from `inst` via
      // useState initializers (which run once per mount); without a per-instance
      // key those fields would keep a previous instance's values — the "remote
      // URL shows blank until you tap it" symptom — and a Save could then
      // persist the stale/empty value over a good stored URL (#106).
      <ServiceEditor
        key={editingInstance.instanceId}
        serviceId={editingInstance.serviceId}
        instanceId={editingInstance.instanceId}
        isNew={editingInstance.isNew ?? false}
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
        onEditInstance={(instanceId, options) =>
          setEditingInstance({
            serviceId: viewingService,
            instanceId,
            isNew: options?.isNew,
          })
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
    // Only show the dot when the kind has at least one enabled instance —
    // disabled kinds have nothing to be healthy about. Use the aggregated
    // kind status from the health hook (best of any instance: ok >
    // auth_failed > offline) so a healthy primary masks a broken secondary.
    const kindHealth = enabledCount > 0
      ? healthData?.find((h) => h.id === id)?.status
      : undefined;
    return (
      <SettingsRow
        key={id}
        leading={<ServiceLogo id={id} size={20} />}
        label={SERVICE_DEFAULTS_KIND_LABEL[id]}
        subtitle={subtitle}
        onPress={() => setViewingService(id)}
        right={
          kindHealth ? (
            <View className={`w-2 h-2 rounded-full ${DOT_BG[kindHealth]}`} />
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
      <View className="mt-2 mb-4">
        <Text className="text-zinc-100 text-2xl font-bold">Settings</Text>
        <Text className="text-zinc-500 text-xs mt-0.5">
          Applies to all dashboards
        </Text>
      </View>

      <SettingsGroup
        title="Services"
        footer="Instances are shared across dashboards. Attach them to a workspace in its settings."
      >
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

      <SettingsGroup
        title="Notifications"
        footer="Apply to all dashboards. Open a specific instance in Services to override per-instance."
      >
        <SettingsToggleRow
          label="Enable notifications"
          description="Master switch for in-app banners and backend pushes"
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
            label="SABnzbd completed"
            value={sabnzbdCompleted}
            onValueChange={(v) => setNotifSetting("sabnzbdCompleted", v)}
          />
        ) : null}
        {notifEnabled ? (
          <SettingsToggleRow
            label="NZBGet completed"
            value={nzbgetCompleted}
            onValueChange={(v) => setNotifSetting("nzbgetCompleted", v)}
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
          leading={<GithubLogo width={githubLogoSize} height={githubLogoSize} />}
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
        <SettingsRow
          icon={Heart}
          label="Support development"
          subtitle="Buy me a coffee on Ko-fi"
          onPress={() => void Linking.openURL("https://ko-fi.com/renzobeux")}
        />
        <SettingsRow
          icon={BookOpen}
          label="Show workspace tour"
          subtitle="Replay the multi-dashboard intro"
          onPress={replayWorkspaceIntro}
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
  onEditInstance: (
    instanceId: string,
    options?: { isNew?: boolean },
  ) => void;
}) {
  const instances = useConfigStore(
    (s) => s.serviceInstances[serviceId] ?? EMPTY_INSTANCES,
  );
  const activeId = useConfigStore((s) => s.activeInstance[serviceId]);
  const addInstance = useConfigStore((s) => s.addInstance);
  const removeInstance = useConfigStore((s) => s.removeInstance);
  const moveInstance = useConfigStore((s) => s.moveInstance);
  const setActiveInstance = useConfigStore((s) => s.setActiveInstance);
  const dashboards = useConfigStore((s) => s.dashboards);
  const kindLabel = SERVICE_DEFAULTS_KIND_LABEL[serviceId];
  // Per-instance tri-state health for the row dot. The shared hook is already
  // polling, so this is a pure index by instance UUID.
  const { data: healthData } = useServiceHealth();
  const healthByInstance = new Map<string, HealthStatusKind>();
  for (const inst of healthData?.find((h) => h.id === serviceId)?.instances ?? []) {
    healthByInstance.set(inst.instanceId, inst.status);
  }

  // v22: how many workspaces attach a given instance UUID. Auto-attach mode
  // (attachedInstances === undefined) counts as attached. Only displayed
  // when the install has more than one dashboard.
  const totalDashboards = dashboards.length;
  const countAttached = (instanceId: string): number => {
    let n = 0;
    for (const d of dashboards) {
      if (d.attachedInstances === undefined || d.attachedInstances.includes(instanceId)) {
        n++;
      }
    }
    return n;
  };

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Intercept Android hardware back / swipe-back so it returns to the main
  // settings list instead of popping the Settings tab (which would land on
  // the dashboard).
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        onBack();
        return true;
      });
      return () => sub.remove();
    }, [onBack]),
  );

  const handleAdd = () => {
    // First instance for a kind takes the kind's default name; subsequent ones
    // are auto-numbered to a unique label so the user has something to edit
    // rather than a blank field.
    const existing = instances.length;
    const defaultName =
      existing === 0 ? kindLabel : `${kindLabel} ${existing + 1}`;
    const inst = addInstance(serviceId, { name: defaultName });
    onEditInstance(inst.id, { isNew: true });
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
          // Only enabled instances are actively probed; for disabled ones
          // we want NO dot (not red) — there's nothing wrong, the user has
          // just turned it off.
          const instanceStatus = inst.enabled
            ? healthByInstance.get(inst.id)
            : undefined;
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
                  {totalDashboards > 1
                    ? (() => {
                        const attached = countAttached(inst.id);
                        const label =
                          attached === 0
                            ? "Not in any workspace"
                            : attached === totalDashboards
                              ? `In all ${totalDashboards} workspaces`
                              : `In ${attached} of ${totalDashboards} workspaces`;
                        return (
                          <Text className="text-zinc-600 text-[0.7rem] mt-0.5">
                            {label}
                          </Text>
                        );
                      })()
                    : null}
                </View>
                {instanceStatus ? (
                  <View
                    className={`w-2 h-2 rounded-full mr-2 ${DOT_BG[instanceStatus]}`}
                  />
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
              Active in this workspace
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
  isNew,
  onBack,
  onDeleted,
}: {
  serviceId: ServiceId;
  instanceId: string;
  isNew: boolean;
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

  // First-save dashboard prompt is offered exactly once per editor session,
  // after the user saves an instance whose initial state was unconfigured
  // (no URL, no credentials). `promptShown` keeps us from re-asking on
  // subsequent saves in the same session if the user already engaged with
  // (or skipped) the sheet.
  const [showAddToDashboards, setShowAddToDashboards] = useState(false);
  const [promptShown, setPromptShown] = useState(false);

  const config = inst ?? {
    enabled: false,
    name: SERVICE_DEFAULTS_KIND_LABEL[serviceId],
    localUrl: "",
    remoteUrl: "",
    useRemote: false,
    ignoreCertErrors: false,
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
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  // Chosen in the unsaved-changes sheet, run only after it has fully closed —
  // "Save" can open the HTTP-warning modal, and stacking modals hangs iOS.
  const unsavedIntent = useRef<"save" | "discard" | null>(null);
  const [httpWarning, setHttpWarning] = useState<{
    message: string;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const usesBasicAuth =
    serviceId === "qbittorrent" ||
    serviceId === "rtorrent" ||
    serviceId === "glances" ||
    serviceId === "nzbget";

  // Snapshot at mount whether this instance has never been configured before
  // (no URL, no creds). Covers two flows that should both surface the prompt:
  //   1. User taps "Add another instance" — `addInstance` creates an empty
  //      slot which arrives here unconfigured.
  //   2. User opens the fresh-install placeholder slot for a kind they've
  //      never used (Bazarr after a reinstall, the default Sonarr row, etc.)
  //      and configures it for the first time — no `addInstance` was called
  //      so `isNew` is false, but this is still functionally a first-time
  //      add from the user's perspective.
  // Re-configuring an already-set-up instance (URL or creds present) won't
  // trigger the prompt — the snapshot stays false through the session.
  const [wasInitiallyUnconfigured] = useState(
    () =>
      config.localUrl.length === 0 &&
      config.remoteUrl.length === 0 &&
      (usesBasicAuth
        ? !secrets.username && !secrets.password
        : !secrets.apiKey),
  );

  const headersJson = JSON.stringify(customHeaders);
  const savedHeadersJson = JSON.stringify(secrets.customHeaders ?? {});

  const isDirty =
    name !== config.name ||
    localUrl !== config.localUrl ||
    remoteUrl !== config.remoteUrl ||
    headersJson !== savedHeadersJson ||
    (usesBasicAuth
      ? username !== (secrets.username ?? "") || password !== (secrets.password ?? "")
      : apiKey !== (secrets.apiKey ?? ""));

  const handleBack = () => {
    if (!isDirty) {
      onBack();
      return;
    }
    setUnsavedOpen(true);
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
      setHttpWarning({ message, resolve });
    });

  const handleSave = async () => {
    if (!inst) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast("Name cannot be empty", "error");
      return;
    }

    const normLocal = normalizeServiceUrl(localUrl);
    const normRemote = normalizeServiceUrl(remoteUrl);
    setLocalUrl(normLocal);
    setRemoteUrl(normRemote);

    const localResult = validateServiceUrl(normLocal, "local");
    if (localResult.kind === "invalid") {
      toast(localResult.message, "error");
      return;
    }
    const remoteResult = validateServiceUrl(normRemote, "remote");
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
      localUrl: normLocal,
      remoteUrl: normRemote,
    });
    if (usesBasicAuth) {
      await updateInstanceSecrets(instanceId, {
        username,
        password,
        customHeaders,
      });
    } else {
      await updateInstanceSecrets(instanceId, { apiKey, customHeaders });
    }
    // Drop the cached qBittorrent SID so the next request re-logs in with the
    // new URL or credentials. (glances and nzbget reuse the basic-auth form
    // but have no session to clear.)
    if (serviceId === "qbittorrent") {
      await qbClearSession(instanceId);
    }

    // First-save dashboard prompt. Fires once per editor session when the
    // instance was unconfigured on entry (either freshly added via "Add
    // another instance" or the untouched fresh-install placeholder) and the
    // save produced a usable config (URL + credential). The sheet always
    // opens — even when every existing dashboard is auto-attach and would
    // implicitly include the new instance — because users on the default
    // single-workspace install still benefit from seeing where it landed
    // and the hint that widgets are added separately.
    if ((isNew || wasInitiallyUnconfigured) && !promptShown) {
      const hasUrl = normLocal.length > 0 || normRemote.length > 0;
      const hasCreds = usesBasicAuth
        ? username.length > 0 || password.length > 0
        : apiKey.length > 0;
      if (hasUrl && hasCreds) {
        setPromptShown(true);
        setShowAddToDashboards(true);
        return;
      }
    }

    onBack();
  };

  const handleTest = async () => {
    setTesting(true);
    // Resolve which URL the app will actually use, mirroring getActiveUrl:
    // the per-instance "always remote" override OR auto-switch deciding we're
    // currently away from home. Testing only `useRemote ? remote : local`
    // (ignoring auto-switch) was misleading — it could report a green local
    // probe while the dashboard silently resolved the empty remote URL and
    // every service failed. We still test the in-progress form values, not the
    // saved ones, so Test validates what the user typed before they Save.
    const { autoSwitchNetwork, networkAwayFromHome } = useConfigStore.getState();
    const useRemote =
      config.useRemote || (autoSwitchNetwork && networkAwayFromHome);
    const which = useRemote ? "remote" : "local";
    const rawTestUrl = useRemote ? remoteUrl : localUrl;
    const testUrl = normalizeServiceUrl(rawTestUrl);
    if (testUrl !== rawTestUrl) {
      if (useRemote) setRemoteUrl(testUrl);
      else setLocalUrl(testUrl);
    }
    const result = await testServiceConnection(serviceId, {
      url: testUrl,
      apiKey,
      username,
      password,
      customHeaders,
    });
    setTesting(false);

    if (result.kind === "ok") {
      toast(`Connected via ${which} URL in ${result.responseTime}ms`, "success");
    } else if (result.kind === "auth_failed") {
      toast(`Auth failed (${which} URL): ${result.message}`, "error");
    } else {
      toast(`Could not reach ${which} URL: ${result.message}`, "error");
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
          onBlur={() => setLocalUrl(normalizeServiceUrl(localUrl))}
          keyboardType="url"
        />
        <TextInput
          label="Remote URL"
          placeholder="https://service.mydomain.com"
          value={remoteUrl}
          onChangeText={setRemoteUrl}
          onBlur={() => setRemoteUrl(normalizeServiceUrl(remoteUrl))}
          keyboardType="url"
        />
        <Toggle
          label="Always use Remote URL"
          description="Force the remote URL even when on a configured home network. Leave off to let auto-switch use the local URL at home."
          value={config.useRemote}
          onValueChange={(v) =>
            updateInstance(serviceId, instanceId, { useRemote: v })
          }
        />
        <Toggle
          label="Allow invalid certificates"
          description="Skip TLS certificate checks for this server, accepting self-signed or otherwise invalid certs. Only enable for servers you trust on a network you control."
          value={config.ignoreCertErrors ?? false}
          onValueChange={(v) =>
            updateInstance(serviceId, instanceId, { ignoreCertErrors: v })
          }
        />
      </Card>

      <Card className="gap-4 mb-4">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Authentication
        </Text>
        {usesBasicAuth ? (
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

      <InstanceNotificationsCard serviceId={serviceId} instanceId={instanceId} />

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

      <AddToDashboardsSheet
        visible={showAddToDashboards}
        instanceId={instanceId}
        instanceName={config.name}
        onClose={() => {
          setShowAddToDashboards(false);
          onBack();
        }}
      />

      <ActionSheet
        visible={unsavedOpen}
        onClose={() => setUnsavedOpen(false)}
        onClosed={() => {
          const intent = unsavedIntent.current;
          unsavedIntent.current = null;
          if (intent === "discard") onBack();
          else if (intent === "save") void handleSave();
        }}
        title="Unsaved changes"
        subtitle="Your URL or credentials haven't been saved."
        actions={[
          {
            label: "Save",
            onPress: () => {
              unsavedIntent.current = "save";
            },
          },
          {
            label: "Discard",
            icon: <Icon icon={Trash2} size={18} color="#ef4444" />,
            variant: "danger",
            onPress: () => {
              unsavedIntent.current = "discard";
            },
          },
        ]}
      />

      <ConfirmModal
        visible={httpWarning !== null}
        title="Remote URL uses HTTP"
        message={httpWarning?.message ?? ""}
        tone="danger"
        confirmLabel="Save anyway"
        onConfirm={() => {
          httpWarning?.resolve(true);
          setHttpWarning(null);
        }}
        onCancel={() => {
          httpWarning?.resolve(false);
          setHttpWarning(null);
        }}
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
// Per-instance notification overrides. For each notification category that
// applies to this kind (see CATEGORIES_FOR_KIND), a 3-option Select decides
// whether to defer to the global toggle or force on/off for this specific
// instance. Stored under notificationSettings.perInstance[instanceId].
function InstanceNotificationsCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  const notif = useConfigStore((s) => s.notificationSettings);
  const setOverride = useConfigStore((s) => s.setInstanceNotificationOverride);
  const categories = CATEGORIES_FOR_KIND[serviceId] ?? [];
  if (categories.length === 0) return null;

  const masterOff = !notif.enabled;
  const overrideMap = notif.perInstance?.[instanceId];

  return (
    <Card className="gap-4 mb-4" style={masterOff ? { opacity: 0.55 } : undefined}>
      <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
        Notifications
      </Text>
      {masterOff ? (
        <Text className="text-zinc-500 text-xs leading-5">
          Notifications are off. Turn them on in Settings → Notifications to
          use per-instance overrides.
        </Text>
      ) : null}
      {categories.map((cat) => {
        const override = overrideMap?.[cat];
        const value: "inherit" | "on" | "off" =
          override === undefined ? "inherit" : override ? "on" : "off";
        const globalOn = notif[cat];
        return (
          <Select
            key={cat}
            label={CATEGORY_LABELS[cat]}
            value={value}
            disabled={masterOff}
            options={[
              {
                value: "inherit",
                label: `Use default (${globalOn ? "On" : "Off"})`,
              },
              { value: "on", label: "Always notify" },
              { value: "off", label: "Never notify" },
            ]}
            onChange={(next) =>
              setOverride(
                instanceId,
                cat satisfies NotifCategory,
                next === "inherit" ? "inherit" : next === "on",
              )
            }
          />
        );
      })}
    </Card>
  );
}

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
