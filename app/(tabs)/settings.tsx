import { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { toast } from "@/components/ui/toast";
import {
  Download,
  Film,
  Tv,
  Inbox,
  BarChart3,
  Search,
  PlayCircle,
  Server,
  Captions,
  ChevronRight,
  Upload,
  FolderDown,
  Wifi,
  Cloud,
  Zap,
} from "lucide-react-native";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { detectWifi } from "@/lib/wifi";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useConfigStore } from "@/store/config-store";
import type { ExportStage, ImportStage } from "@/store/config-store";
import { ProgressModal } from "@/components/common/progress-modal";
import { pingService } from "@/lib/http-client";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import { validateServiceUrl } from "@/lib/url-validation";
import { NotificationSettingsSection } from "@/components/common/notification-settings-section";
import { AppVersionCard } from "@/components/common/app-version-card";
import { PassphrasePrompt } from "@/components/common/passphrase-prompt";
import type { PassphraseMode, PassphraseResult } from "@/components/common/passphrase-prompt";
import {
  forgetRememberedPassphrase,
  hasRememberedPassphrase,
  loadRememberedPassphrase,
  saveRememberedPassphrase,
} from "@/lib/config-passphrase";

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  qbittorrent: Download,
  radarr: Film,
  sonarr: Tv,
  overseerr: Inbox,
  tautulli: BarChart3,
  prowlarr: Search,
  plex: PlayCircle,
  glances: Server,
  bazarr: Captions,
};

export default function SettingsScreen() {
  const [editingService, setEditingService] = useState<ServiceId | null>(null);
  const [exportStage, setExportStage] = useState<ExportStage | null>(null);
  const [importStage, setImportStage] = useState<ImportStage | null>(null);
  const [detectingSSID, setDetectingSSID] = useState(false);
  const [passphraseRequest, setPassphraseRequest] = useState<{
    mode: PassphraseMode;
    resolve: (value: PassphraseResult | null) => void;
  } | null>(null);
  const [hasRemembered, setHasRemembered] = useState(() => hasRememberedPassphrase());

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

  const handleDetectSSID = async () => {
    setDetectingSSID(true);
    try {
      const wifi = await detectWifi();
      if (wifi) {
        setHomeSSID(wifi.ssid);
        // Also pin the BSSID (AP MAC). Makes auto-switch resistant to a
        // rogue AP cloning the home SSID. Empty if the platform doesn't
        // surface a BSSID on this build.
        setHomeBSSID(wifi.bssid);
        const suffix = wifi.bssid ? ` · pinned to AP ${wifi.bssid}` : " · no BSSID available";
        toast(`Detected: ${wifi.ssid}${suffix}`, "success");
      } else {
        toast("Could not detect WiFi name. Check that you're on WiFi and location is allowed.", "error");
      }
    } catch {
      toast("Failed to detect WiFi name", "error");
    } finally {
      setDetectingSSID(false);
    }
  };
  const services = useConfigStore((s) => s.services);
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const homeSSID = useConfigStore((s) => s.homeSSID);
  const homeBSSID = useConfigStore((s) => s.homeBSSID);
  const setAutoSwitch = useConfigStore((s) => s.setAutoSwitch);
  const setHomeSSID = useConfigStore((s) => s.setHomeSSID);
  const setHomeBSSID = useConfigStore((s) => s.setHomeBSSID);
  const exportConfig = useConfigStore((s) => s.exportConfig);
  const importConfig = useConfigStore((s) => s.importConfig);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const demoMode = useConfigStore((s) => s.demoMode);
  const enableDemoMode = useConfigStore((s) => s.enableDemoMode);
  const disableDemoMode = useConfigStore((s) => s.disableDemoMode);

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

  const handleImport = () => {
    Alert.alert(
      "Import Configuration",
      "This will overwrite all current settings with the imported configuration. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Import",
          style: "destructive",
          onPress: async () => {
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
          },
        },
      ],
    );
  };

  if (editingService) {
    return (
      <ServiceEditor
        serviceId={editingService}
        onBack={() => setEditingService(null)}
      />
    );
  }

  return (
    <ScreenWrapper>
      <Text className="text-zinc-100 text-2xl font-bold mt-2 mb-4">
        Settings
      </Text>

      <Card className="gap-4 mb-4">
        <Toggle
          label="Auto-switch network"
          description="Use local URLs on home WiFi, remote otherwise"
          value={autoSwitchNetwork}
          onValueChange={setAutoSwitch}
        />
        {autoSwitchNetwork && (
          <>
            <View className="flex-row items-end gap-2">
              <View className="flex-1">
                <TextInput
                  label="Home WiFi Name (SSID)"
                  placeholder="e.g. MyHomeNetwork"
                  value={homeSSID}
                  onChangeText={setHomeSSID}
                />
              </View>
              <Pressable
                onPress={handleDetectSSID}
                disabled={detectingSSID}
                className="bg-surface-light rounded-xl p-3 active:opacity-70"
              >
                {detectingSSID ? (
                  <ActivityIndicator size={20} color="#a1a1aa" />
                ) : (
                  <Wifi size={20} color="#a1a1aa" />
                )}
              </Pressable>
            </View>
            {homeBSSID ? (
              <View className="flex-row items-center justify-between -mt-2">
                <Text className="text-zinc-500 text-xs flex-1">
                  Pinned to AP <Text className="text-zinc-300">{homeBSSID}</Text>
                </Text>
                <Pressable
                  onPress={() => setHomeBSSID("")}
                  className="active:opacity-70 px-2 py-1"
                >
                  <Text className="text-primary text-xs">Clear pin</Text>
                </Pressable>
              </View>
            ) : homeSSID ? (
              <Text className="text-zinc-500 text-xs -mt-2">
                Tap the WiFi icon while connected to your home network to pin its AP — guards against rogue access points that clone your SSID.
              </Text>
            ) : null}
          </>
        )}
      </Card>

      <Pressable onPress={() => router.push("/wake-on-lan")} className="active:opacity-80 mb-4">
        <Card className="flex-row items-center">
          <View className="bg-surface-light rounded-xl p-2.5 mr-3">
            <Zap size={20} color="#a1a1aa" />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-100 text-base">Wake-on-LAN</Text>
            <Text className="text-zinc-500 text-xs">
              {wolDevices.length
                ? `${wolDevices.length} device${wolDevices.length > 1 ? "s" : ""} configured`
                : "Wake devices on your network"}
            </Text>
          </View>
          <ChevronRight size={18} color="#71717a" />
        </Card>
      </Pressable>

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
        Demo
      </Text>

      <Card className="mb-4">
        <Toggle
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
      </Card>

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1">
        Services
      </Text>

      <View className="gap-2">
        {SERVICE_IDS.map((id) => {
          const config = services[id];
          const Icon = SERVICE_ICONS[id];

          return (
            <Pressable
              key={id}
              onPress={() => setEditingService(id)}
              className="active:opacity-80"
            >
              <Card className="flex-row items-center">
                <View className="bg-surface-light rounded-xl p-2.5 mr-3">
                  <Icon size={20} color="#a1a1aa" />
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-100 text-base">{config.name}</Text>
                  <Text className="text-zinc-500 text-xs">
                    {config.enabled
                      ? config.useRemote
                        ? config.remoteUrl || "No remote URL"
                        : config.localUrl || "No local URL"
                      : "Not configured"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-2">
                  {config.enabled && (
                    <View className="w-2 h-2 rounded-full bg-success" />
                  )}
                  <ChevronRight size={18} color="#71717a" />
                </View>
              </Card>
            </Pressable>
          );
        })}
      </View>

      <NotificationSettingsSection />

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1 mt-6">
        Push Notifications
      </Text>

      <Pressable onPress={() => router.push("/backend")} className="active:opacity-80 mb-4">
        <Card className="flex-row items-center">
          <View className="bg-surface-light rounded-xl p-2.5 mr-3">
            <Cloud size={20} color="#a1a1aa" />
          </View>
          <View className="flex-1">
            <Text className="text-zinc-100 text-base">Backend</Text>
            <Text className="text-zinc-500 text-xs">
              Self-host for real push notifications when the app is closed
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            <BackendStatusPill />
            <ChevronRight size={18} color="#71717a" />
          </View>
        </Card>
      </Pressable>

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1 mt-2">
        Backup
      </Text>

      <View className="flex-row gap-3">
        <Pressable
          onPress={handleExport}
          disabled={exportStage !== null}
          className="flex-1 active:opacity-80"
        >
          <Card className="flex-row items-center justify-center gap-2">
            <Upload size={18} color="#a1a1aa" />
            <Text className="text-zinc-100 text-base">Export</Text>
          </Card>
        </Pressable>

        <Pressable
          onPress={handleImport}
          disabled={importStage !== null}
          className="flex-1 active:opacity-80"
        >
          <Card className="flex-row items-center justify-center gap-2">
            <FolderDown size={18} color="#a1a1aa" />
            <Text className="text-zinc-100 text-base">Import</Text>
          </Card>
        </Pressable>
      </View>

      <Text className="text-zinc-600 text-xs text-center mt-2 mb-4">
        Backups are encrypted with a passphrase you choose. Keep it safe — without it the backup cannot be restored.
      </Text>

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
  const [testing, setTesting] = useState(false);

  const isQB = serviceId === "qbittorrent" || serviceId === "glances";

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

    updateService(serviceId, { localUrl, remoteUrl });
    if (isQB) {
      await updateSecrets(serviceId, { username, password });
    } else {
      await updateSecrets(serviceId, { apiKey });
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
      <View className="flex-row items-center mb-4 mt-2">
        <Pressable onPress={onBack} className="mr-3 active:opacity-70">
          <Text className="text-primary text-base">← Back</Text>
        </Pressable>
        <Text className="text-zinc-100 text-xl font-bold">{config.name}</Text>
      </View>

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
