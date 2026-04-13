import { useState, useCallback, useEffect } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator, Platform } from "react-native";
import { router } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import { ArrowLeft, Bell, QrCode, Unlink, Cloud, CloudOff } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { BackendStatusPill } from "@/components/ui/backend-status-pill";
import { toast } from "@/components/ui/toast";
import { useBackendStore } from "@/store/backend-store";
import {
  getBackendHealth,
  pairClaim,
  pushConfigSnapshot,
  testPush,
  unregisterDevice,
} from "@/services/backend-api";
import { getExpoPushToken, hasProjectId } from "@/lib/expo-push";

type Mode = "summary" | "scanning" | "manual";

interface QrPayload {
  url: string;
  token: string;
}

function parseQr(data: string): QrPayload | null {
  try {
    const parsed = JSON.parse(data) as QrPayload;
    if (typeof parsed.url === "string" && typeof parsed.token === "string") {
      return parsed;
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

  const [mode, setMode] = useState<Mode>("summary");
  const [busy, setBusy] = useState(false);
  const [manualUrl, setManualUrl] = useState("");
  const [manualToken, setManualToken] = useState("");
  const [permission, requestPermission] = useCameraPermissions();

  const projectReady = hasProjectId();

  const handleClaim = useCallback(
    async (payload: QrPayload) => {
      setBusy(true);
      try {
        const expoPushToken = await getExpoPushToken();
        if (!expoPushToken) {
          toast("Push permissions denied or projectId missing", "error");
          setBusy(false);
          return;
        }
        const platform: "ios" | "android" = Platform.OS === "ios" ? "ios" : "android";
        const result = await pairClaim(payload.url, payload.token, expoPushToken, platform);
        await pair({ url: payload.url, sharedSecret: result.sharedSecret, deviceId: result.deviceId });
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
        setMode("summary");
      } catch (err) {
        console.warn("pair failed", err);
        toast(err instanceof Error ? err.message : "Pairing failed", "error");
      } finally {
        setBusy(false);
      }
    },
    [pair],
  );

  const handleScan = useCallback(
    ({ data }: { data: string }) => {
      if (busy) return;
      const payload = parseQr(data);
      if (!payload) {
        toast("Unrecognized QR code", "error");
        return;
      }
      void handleClaim(payload);
    },
    [busy, handleClaim],
  );

  const handleManual = useCallback(async () => {
    if (!manualUrl.trim() || !manualToken.trim()) {
      toast("Enter URL and token", "error");
      return;
    }
    await handleClaim({ url: manualUrl.trim().replace(/\/$/, ""), token: manualToken.trim() });
  }, [manualUrl, manualToken, handleClaim]);

  const handleTestPush = useCallback(async () => {
    setBusy(true);
    try {
      await testPush();
      toast("Test push sent", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Test push failed", "error");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleUnpair = useCallback(() => {
    Alert.alert("Unpair backend", "This will stop push notifications from this backend. Continue?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Unpair",
        style: "destructive",
        onPress: async () => {
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
        },
      },
    ]);
  }, [unpair]);

  useEffect(() => {
    if (mode === "scanning" && !permission?.granted) {
      void requestPermission();
    }
  }, [mode, permission, requestPermission]);

  return (
    <ScreenWrapper>
      <View className="flex-row items-center mb-4 mt-2">
        <Pressable onPress={() => router.back()} className="mr-3 active:opacity-70 p-1">
          <ArrowLeft size={22} color="#e4e4e7" />
        </Pressable>
        <Text className="text-zinc-100 text-xl font-bold flex-1">Backend</Text>
        <BackendStatusPill />
      </View>

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
                    <Cloud size={18} color="#22c55e" />
                  ) : (
                    <CloudOff size={18} color="#f59e0b" />
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

              <Pressable onPress={handleUnpair} disabled={busy} className="active:opacity-80">
                <Card className="flex-row items-center justify-center gap-2 bg-red-950/30 border border-red-900/50">
                  <Unlink size={16} color="#f87171" />
                  <Text className="text-red-400 text-base">Unpair</Text>
                </Card>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable
                onPress={() => setMode("scanning")}
                disabled={busy || !projectReady}
                className="active:opacity-80 mb-3"
              >
                <Card className="flex-row items-center justify-center gap-2">
                  <QrCode size={18} color="#a1a1aa" />
                  <Text className="text-zinc-100 text-base">Scan pairing QR</Text>
                </Card>
              </Pressable>

              <Pressable
                onPress={() => setMode("manual")}
                disabled={busy || !projectReady}
                className="active:opacity-80"
              >
                <Card className="flex-row items-center justify-center gap-2">
                  <Bell size={18} color="#a1a1aa" />
                  <Text className="text-zinc-100 text-base">Enter URL + token manually</Text>
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
            <TextInput
              label="Backend URL"
              placeholder="http://192.168.1.50:4000"
              value={manualUrl}
              onChangeText={setManualUrl}
              keyboardType="url"
              autoCapitalize="none"
            />
            <TextInput
              label="Pairing token"
              placeholder="hex token from backend logs / /pair page"
              value={manualToken}
              onChangeText={setManualToken}
              autoCapitalize="none"
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
    </ScreenWrapper>
  );
}
