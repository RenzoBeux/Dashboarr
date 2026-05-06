import { useState } from "react";
import { View, Text, Pressable, Alert, ActivityIndicator } from "react-native";
import { Wifi, Plus, Pencil, Trash2 } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { toast } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";
import { detectWifi, normalizeBssid } from "@/lib/wifi";
import type { HomeNetwork } from "@/store/config-store";

const MAX_HOME_NETWORKS = 20;
const MAC_RE = /^[0-9a-f:.\-]+$/i;

type Mode = "list" | "add" | "edit";

export default function HomeNetworksScreen() {
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const addHomeNetwork = useConfigStore((s) => s.addHomeNetwork);
  const updateHomeNetwork = useConfigStore((s) => s.updateHomeNetwork);
  const removeHomeNetwork = useConfigStore((s) => s.removeHomeNetwork);

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [bssid, setBssid] = useState("");
  const [detecting, setDetecting] = useState(false);

  const resetForm = () => {
    setSsid("");
    setBssid("");
    setEditingId(null);
  };

  const startAdd = () => {
    if (homeNetworks.length >= MAX_HOME_NETWORKS) {
      toast(`Maximum of ${MAX_HOME_NETWORKS} networks reached`, "error");
      return;
    }
    resetForm();
    setMode("add");
  };

  const startEdit = (network: HomeNetwork) => {
    setEditingId(network.id);
    setSsid(network.ssid);
    setBssid(network.bssid);
    setMode("edit");
  };

  const handleDetect = async () => {
    setDetecting(true);
    try {
      const wifi = await detectWifi();
      if (!wifi) {
        toast(
          "Could not detect WiFi name. Check that you're on WiFi and location is allowed.",
          "error",
        );
        return;
      }
      // Prefill the add form so the user can confirm before saving — guards
      // against accidentally adding the airport WiFi they happen to be on.
      resetForm();
      setSsid(wifi.ssid);
      setBssid(wifi.bssid);
      setMode("add");
      const suffix = wifi.bssid ? ` · pinned to AP ${wifi.bssid}` : " · no BSSID available";
      toast(`Detected: ${wifi.ssid}${suffix}`, "success");
    } catch {
      toast("Failed to detect WiFi name", "error");
    } finally {
      setDetecting(false);
    }
  };

  const handleSave = () => {
    const trimmedSsid = ssid.trim();
    if (!trimmedSsid) {
      toast("WiFi name (SSID) is required", "error");
      return;
    }
    if (trimmedSsid.length > 64) {
      toast("WiFi name is too long", "error");
      return;
    }

    const trimmedBssid = bssid.trim();
    if (trimmedBssid && !MAC_RE.test(trimmedBssid)) {
      toast("BSSID looks invalid — use a MAC like aa:bb:cc:dd:ee:ff", "error");
      return;
    }
    if (trimmedBssid.length > 64) {
      toast("BSSID is too long", "error");
      return;
    }

    const normalizedBssid = normalizeBssid(trimmedBssid);

    // Block exact (ssid, bssid) duplicates so a single AP can't appear twice.
    // In edit mode the entry being edited is excluded from the check.
    const duplicate = homeNetworks.some(
      (n) =>
        n.id !== editingId &&
        n.ssid === trimmedSsid &&
        n.bssid === normalizedBssid,
    );
    if (duplicate) {
      toast("This network is already saved", "error");
      return;
    }

    if (mode === "add") {
      if (homeNetworks.length >= MAX_HOME_NETWORKS) {
        toast(`Maximum of ${MAX_HOME_NETWORKS} networks reached`, "error");
        return;
      }
      addHomeNetwork({ ssid: trimmedSsid, bssid: normalizedBssid });
      toast(`${trimmedSsid} added`, "success");
    } else if (editingId) {
      updateHomeNetwork(editingId, { ssid: trimmedSsid, bssid: normalizedBssid });
      toast(`${trimmedSsid} updated`, "success");
    }

    resetForm();
    setMode("list");
  };

  const handleDelete = (network: HomeNetwork) => {
    Alert.alert(
      "Remove network",
      `Stop treating "${network.ssid}" as a home network?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: () => {
            removeHomeNetwork(network.id);
            toast(`${network.ssid} removed`, "success");
          },
        },
      ],
    );
  };

  if (mode === "add" || mode === "edit") {
    return (
      <ScreenWrapper>
        <BackHeader
          title={mode === "add" ? "Add Home Network" : "Edit Home Network"}
          onBack={() => {
            resetForm();
            setMode("list");
          }}
        />

        <Card className="gap-4 mb-4">
          <View className="flex-row items-end gap-2">
            <View className="flex-1">
              <TextInput
                label="WiFi Name (SSID)"
                placeholder="e.g. MyHomeNetwork"
                value={ssid}
                onChangeText={setSsid}
                autoCapitalize="none"
              />
            </View>
            <Pressable
              onPress={handleDetect}
              disabled={detecting}
              className="bg-surface-light rounded-xl p-3 active:opacity-70"
            >
              {detecting ? (
                <ActivityIndicator size={20} color="#a1a1aa" />
              ) : (
                <Wifi size={20} color="#a1a1aa" />
              )}
            </Pressable>
          </View>

          <View>
            <TextInput
              label="Access Point MAC (BSSID, optional)"
              placeholder="aa:bb:cc:dd:ee:ff"
              value={bssid}
              onChangeText={setBssid}
              autoCapitalize="none"
            />
            <Text className="text-zinc-500 text-xs mt-1">
              Leave empty to match any AP with this name. Set it to guard against
              rogue access points cloning your SSID.
            </Text>
          </View>
        </Card>

        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            onPress={() => {
              resetForm();
              setMode("list");
            }}
            variant="outline"
            className="flex-1"
          />
          <Button label="Save" onPress={handleSave} className="flex-1" />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <BackHeader
        title="Home Networks"
        right={
          <Pressable onPress={startAdd} className="active:opacity-70 p-1">
            <Plus size={22} color="#3b82f6" />
          </Pressable>
        }
      />

      {!homeNetworks.length ? (
        <View className="items-center justify-center py-20 gap-3">
          <Wifi size={40} color="#3f3f46" />
          <Text className="text-zinc-400 text-base text-center">
            No home networks configured
          </Text>
          <Text className="text-zinc-500 text-sm text-center px-6">
            Add at least one network to enable automatic local/remote URL
            switching.
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Button
              label="Add current WiFi"
              onPress={handleDetect}
              loading={detecting}
              icon={<Wifi size={14} color="#fff" />}
              size="sm"
            />
            <Button
              label="Add manually"
              onPress={startAdd}
              variant="outline"
              icon={<Plus size={14} color="#a1a1aa" />}
              size="sm"
            />
          </View>
        </View>
      ) : (
        <View className="gap-3">
          {homeNetworks.map((network) => (
            <Card key={network.id} className="gap-2">
              <View className="flex-row items-center">
                <View className="bg-surface-light rounded-xl p-2.5 mr-3">
                  <Wifi size={20} color="#a1a1aa" />
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-100 text-base font-medium">
                    {network.ssid}
                  </Text>
                  <Text className="text-zinc-500 text-xs">
                    {network.bssid ? `Pinned to ${network.bssid}` : "SSID-only match"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable
                    onPress={() => startEdit(network)}
                    className="p-2 active:opacity-70"
                  >
                    <Pencil size={16} color="#71717a" />
                  </Pressable>
                  <Pressable
                    onPress={() => handleDelete(network)}
                    className="p-2 active:opacity-70"
                  >
                    <Trash2 size={16} color="#71717a" />
                  </Pressable>
                </View>
              </View>
            </Card>
          ))}
          <View className="flex-row gap-2 mt-1">
            <Button
              label="Add current WiFi"
              onPress={handleDetect}
              loading={detecting}
              variant="outline"
              icon={<Wifi size={14} color="#a1a1aa" />}
              size="sm"
              className="flex-1"
            />
            <Button
              label="Add manually"
              onPress={startAdd}
              variant="outline"
              icon={<Plus size={14} color="#a1a1aa" />}
              size="sm"
              className="flex-1"
            />
          </View>
        </View>
      )}
    </ScreenWrapper>
  );
}
