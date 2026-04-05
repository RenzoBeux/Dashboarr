import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
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
  ChevronRight,
  Upload,
  FolderDown,
} from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { TextInput } from "@/components/ui/text-input";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { useConfigStore } from "@/store/config-store";
import { pingService } from "@/lib/http-client";
import { SERVICE_IDS } from "@/lib/constants";
import type { ServiceId } from "@/lib/constants";
import type { ServiceConfig, ServiceSecrets } from "@/store/config-store";

const SERVICE_ICONS: Record<ServiceId, React.ElementType> = {
  qbittorrent: Download,
  radarr: Film,
  sonarr: Tv,
  overseerr: Inbox,
  tautulli: BarChart3,
  prowlarr: Search,
  plex: PlayCircle,
  glances: Server,
};

export default function SettingsScreen() {
  const [editingService, setEditingService] = useState<ServiceId | null>(null);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const services = useConfigStore((s) => s.services);
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const setAutoSwitch = useConfigStore((s) => s.setAutoSwitch);
  const exportConfig = useConfigStore((s) => s.exportConfig);
  const importConfig = useConfigStore((s) => s.importConfig);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportConfig();
    } catch {
      toast("Failed to export config", "error");
    } finally {
      setExporting(false);
    }
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
            setImporting(true);
            try {
              const success = await importConfig();
              if (success) {
                toast("Configuration imported successfully", "success");
              }
            } catch {
              toast("Invalid config file", "error");
            } finally {
              setImporting(false);
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

      <Card className="mb-4">
        <Toggle
          label="Auto-switch network"
          description="Use local URLs on home WiFi, remote otherwise"
          value={autoSwitchNetwork}
          onValueChange={setAutoSwitch}
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

      <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mb-2 ml-1 mt-6">
        Backup
      </Text>

      <View className="flex-row gap-3">
        <Pressable onPress={handleExport} disabled={exporting} className="flex-1 active:opacity-80">
          <Card className="flex-row items-center justify-center gap-2">
            <Upload size={18} color="#a1a1aa" />
            <Text className="text-zinc-100 text-base">
              {exporting ? "Exporting..." : "Export"}
            </Text>
          </Card>
        </Pressable>

        <Pressable onPress={handleImport} disabled={importing} className="flex-1 active:opacity-80">
          <Card className="flex-row items-center justify-center gap-2">
            <FolderDown size={18} color="#a1a1aa" />
            <Text className="text-zinc-100 text-base">
              {importing ? "Importing..." : "Import"}
            </Text>
          </Card>
        </Pressable>
      </View>

      <Text className="text-zinc-600 text-xs text-center mt-2 mb-4">
        Export saves all service URLs, API keys, and settings to a JSON file.
      </Text>
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

  const handleSave = async () => {
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
