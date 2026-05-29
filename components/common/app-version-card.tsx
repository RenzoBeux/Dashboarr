import { useState } from "react";
import { View, Text, Linking } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { toast, toastError } from "@/components/ui/toast";
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
  const [storeUpdate, setStoreUpdate] = useState<{
    message: string;
    confirmLabel: string;
    url: string;
  } | null>(null);
  const [otaUpdate, setOtaUpdate] = useState(false);
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
            ({
              storeVersion: null,
              storeUrl: "",
              hasUpdate: false,
              unknown: true,
              source: null,
            }) as const,
        ),
      ]);
      const otaResult = otaSettled.ok ? otaSettled.value : { available: false };
      const sourceLabel =
        storeResult.source === "github"
          ? "GitHub"
          : storeResult.source === "play-store"
            ? "the Play Store"
            : storeResult.source === "app-store"
              ? "the App Store"
              : "the store";
      const openButtonLabel =
        storeResult.source === "github" ? "Open release" : "Open store";

      if (storeResult.hasUpdate && storeResult.storeVersion) {
        setStoreUpdate({
          message: `A newer version (${storeResult.storeVersion}) is available on ${sourceLabel}. You're on ${NATIVE_VERSION}.`,
          confirmLabel: openButtonLabel,
          url: storeResult.storeUrl ?? "",
        });
        return;
      }

      if (otaResult.available) {
        setOtaUpdate(true);
        return;
      }

      if (!otaSettled.ok) {
        const msg =
          otaSettled.error instanceof Error
            ? otaSettled.error.message
            : String(otaSettled.error);
        toast(msg || "Unknown error checking for updates.", "error");
        return;
      }

      if (storeResult.unknown) {
        toast(`You're up to date (couldn't reach ${sourceLabel} — OTA is current)`, "success");
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
        <Icon icon={Sparkles} size={16} color="#a1a1aa" />
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

      <ConfirmModal
        visible={storeUpdate !== null}
        title="Update available"
        message={storeUpdate?.message ?? ""}
        icon={Sparkles}
        confirmLabel={storeUpdate?.confirmLabel ?? "Open"}
        cancelLabel="Later"
        onConfirm={() => {
          if (storeUpdate?.url) Linking.openURL(storeUpdate.url);
          setStoreUpdate(null);
        }}
        onCancel={() => setStoreUpdate(null)}
      />

      <ConfirmModal
        visible={otaUpdate}
        title="Update available"
        message="A new over-the-air update is available. Install and restart now?"
        icon={Sparkles}
        confirmLabel="Install"
        cancelLabel="Later"
        onConfirm={async () => {
          setOtaUpdate(false);
          try {
            await downloadAndApplyOtaUpdate();
          } catch (err) {
            toastError("Failed to install update", err);
          }
        }}
        onCancel={() => setOtaUpdate(false)}
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
