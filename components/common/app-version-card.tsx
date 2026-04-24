import { useState } from "react";
import { View, Text, Alert, Linking } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import {
  NATIVE_VERSION,
  RUNTIME_VERSION,
  UPDATE_CHANNEL,
  getCurrentUpdateId,
  checkForOtaUpdate,
  downloadAndApplyOtaUpdate,
  checkStoreVersion,
} from "@/lib/app-version";

export function AppVersionCard() {
  const [checking, setChecking] = useState(false);
  const updateId = getCurrentUpdateId();
  const updateIdLabel = updateId ? updateId.slice(0, 8) : "embedded";

  const handleCheck = async () => {
    setChecking(true);
    try {
      const [otaSettled, storeResult] = await Promise.all([
        checkForOtaUpdate().then(
          (r) => ({ ok: true as const, value: r }),
          (err: unknown) => ({ ok: false as const, error: err }),
        ),
        checkStoreVersion().catch(
          () =>
            ({ storeVersion: null, storeUrl: "", hasUpdate: false, unknown: true }) as const,
        ),
      ]);
      const otaResult = otaSettled.ok ? otaSettled.value : { available: false };

      if (storeResult.hasUpdate && storeResult.storeVersion) {
        Alert.alert(
          "Update available",
          `A newer version (${storeResult.storeVersion}) is available on the store. You're on ${NATIVE_VERSION}.`,
          [
            { text: "Later", style: "cancel" },
            {
              text: "Open store",
              onPress: () => {
                if (storeResult.storeUrl) Linking.openURL(storeResult.storeUrl);
              },
            },
          ],
        );
        return;
      }

      if (otaResult.available) {
        Alert.alert(
          "Update available",
          "A new over-the-air update is available. Install and restart now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Install",
              onPress: async () => {
                try {
                  await downloadAndApplyOtaUpdate();
                } catch {
                  toast("Failed to install update", "error");
                }
              },
            },
          ],
        );
        return;
      }

      if (!otaSettled.ok) {
        const msg =
          otaSettled.error instanceof Error
            ? otaSettled.error.message
            : String(otaSettled.error);
        Alert.alert("OTA check failed", msg || "Unknown error checking for updates.");
        return;
      }

      if (storeResult.unknown) {
        toast("You're up to date (couldn't reach store — OTA is current)", "success");
      } else {
        toast("You're up to date", "success");
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <Card className="gap-3 mb-4">
      <View className="flex-row items-center gap-2">
        <Sparkles size={16} color="#a1a1aa" />
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          App version
        </Text>
      </View>

      <View className="gap-1">
        <VersionRow label="Version" value={NATIVE_VERSION} />
        <VersionRow label="Runtime" value={RUNTIME_VERSION} />
        <VersionRow label="Update" value={updateIdLabel} />
        {UPDATE_CHANNEL && <VersionRow label="Channel" value={UPDATE_CHANNEL} />}
      </View>

      <Button
        label="Check for updates"
        onPress={handleCheck}
        variant="outline"
        loading={checking}
      />
    </Card>
  );
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-zinc-500 text-sm">{label}</Text>
      <Text className="text-zinc-300 text-sm font-mono">{value}</Text>
    </View>
  );
}
