import { useCallback, useState } from "react";
import { View, Text, Alert, BackHandler } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { toast } from "@/components/ui/toast";
import {
  Download,
  Film,
  Tv,
  Inbox,
  BarChart3,
  Search,
  PlayCircle,
  Clapperboard,
  Server,
  Captions,
  Upload,
  FolderDown,
  Wifi,
  Cloud,
  Zap,
  ImageOff,
  Globe,
} from "lucide-react-native";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Select } from "@/components/ui/select";
import { HeaderListEditor } from "@/components/ui/header-list-editor";
import { useConfigStore } from "@/store/config-store";
import type { ExportStage, ImportStage } from "@/store/config-store";
import { useNotificationStore } from "@/store/notifications-store";
import { ProgressModal } from "@/components/common/progress-modal";
import { BackHeader } from "@/components/common/back-header";
import { pingService } from "@/lib/http-client";
import { qbClearSession } from "@/services/qbittorrent-api";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { validateServiceUrl } from "@/lib/url-validation";
import { brrrHaptic } from "@/lib/haptics";
import { AppVersionCard } from "@/components/common/app-version-card";
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

const SERVICE_ICONS: Record<ServiceId, React.ComponentType<any>> = {
  qbittorrent: Download,
  radarr: Film,
  sonarr: Tv,
  overseerr: Inbox,
  tautulli: BarChart3,
  prowlarr: Search,
  plex: PlayCircle,
  jellyfin: Clapperboard,
  glances: Server,
  bazarr: Captions,
};

export default function SettingsScreen() {
  const [editingService, setEditingService] = useState<ServiceId | null>(null);
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

  const services = useConfigStore((s) => s.services);
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

  if (editingService) {
    return (
      <ServiceEditor
        serviceId={editingService}
        onBack={() => setEditingService(null)}
      />
    );
  }

  const enabledServiceIds = SERVICE_IDS.filter((id) => services[id].enabled);
  const disabledServiceIds = SERVICE_IDS.filter((id) => !services[id].enabled);

  const renderServiceRow = (id: ServiceId) => {
    const config = services[id];
    const ServiceIcon = SERVICE_ICONS[id];
    const subtitle = config.enabled
      ? config.useRemote
        ? config.remoteUrl || "No remote URL"
        : config.localUrl || "No local URL"
      : "Tap to configure";
    return (
      <SettingsRow
        key={id}
        icon={ServiceIcon}
        label={config.name}
        subtitle={subtitle}
        onPress={() => setEditingService(id)}
        right={
          config.enabled ? (
            <View className="w-2 h-2 rounded-full bg-success" />
          ) : null
        }
      />
    );
  };

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-2xl font-bold mt-2 mb-4">
        Settings
      </Text>

      <SettingsGroup title="Services">
        {enabledServiceIds.map(renderServiceRow)}
        {disabledServiceIds.length > 0 && enabledServiceIds.length > 0 ? (
          <View className="px-4 py-2 bg-surface-light/30">
            <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
              Not configured
            </Text>
          </View>
        ) : null}
        {disabledServiceIds.map(renderServiceRow)}
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

function ServiceEditor({
  serviceId,
  onBack,
}: {
  serviceId: ServiceId;
  onBack: () => void;
}) {
  const config = useConfigStore((s) => s.services[serviceId]);
  const secrets = useConfigStore((s) => s.secrets[serviceId]);
  const updateService = useConfigStore((s) => s.updateService);
  const updateSecrets = useConfigStore((s) => s.updateSecrets);
  const toggleService = useConfigStore((s) => s.toggleService);

  const [localUrl, setLocalUrl] = useState(config.localUrl);
  const [remoteUrl, setRemoteUrl] = useState(config.remoteUrl);
  const [apiKey, setApiKey] = useState(secrets.apiKey ?? "");
  const [username, setUsername] = useState(secrets.username ?? "");
  const [password, setPassword] = useState(secrets.password ?? "");
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>(
    secrets.customHeaders ?? {},
  );
  const [testing, setTesting] = useState(false);

  const isQB = serviceId === "qbittorrent" || serviceId === "glances";

  const headersJson = JSON.stringify(customHeaders);
  const savedHeadersJson = JSON.stringify(secrets.customHeaders ?? {});

  const isDirty =
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

    updateService(serviceId, { localUrl, remoteUrl });
    if (isQB) {
      await updateSecrets(serviceId, { username, password, customHeaders });
    } else {
      await updateSecrets(serviceId, { apiKey, customHeaders });
    }
    // Drop the cached qBittorrent SID so the next request re-logs in with the
    // new URL or credentials. (glances reuses isQB for its u/p form but has
    // no session to clear.)
    if (serviceId === "qbittorrent") {
      await qbClearSession();
    }
    onBack();
  };

  const handleTest = async () => {
    setTesting(true);
    const testUrl = config.useRemote ? remoteUrl : localUrl;
    const responseTime = await pingService(serviceId, testUrl || undefined);
    setTesting(false);

    if (responseTime !== null) {
      toast(`Connected in ${responseTime}ms`, "success");
    } else {
      toast("Could not reach service. Check URL and network.", "error");
    }
  };

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

      <Card className="mb-4">
        <Toggle
          label="Enabled"
          value={config.enabled}
          onValueChange={() => toggleService(serviceId)}
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
          onValueChange={(v) => updateService(serviceId, { useRemote: v })}
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
          helperText="Sent on every request to this service. Combined with the global headers (Settings → Custom Headers). The service's own auth (API Key, Plex Token, etc.) always wins on collision."
        />
      </Card>

      <View className="flex-row gap-3">
        <Button
          label="Test Connection"
          onPress={handleTest}
          variant="outline"
          loading={testing}
          className="flex-1"
        />
        <Button
          label="Save"
          onPress={handleSave}
          className="flex-1"
        />
      </View>
    </ScreenWrapper>
  );
}
