import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, Zap, Plus, Pencil, Trash2, X } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { toast } from "@/components/ui/toast";
import { useConfigStore } from "@/store/config-store";
import { sendWakeOnLan, WakeOnLanError } from "@/lib/wake-on-lan";
import type { WakeOnLanDevice } from "@/store/config-store";

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

type Mode = "list" | "add" | "edit";

export default function WakeOnLanScreen() {
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const setWolDevices = useConfigStore((s) => s.setWolDevices);

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [mac, setMac] = useState("");
  const [broadcastAddress, setBroadcastAddress] = useState("");
  const [port, setPort] = useState("");
  const [sendingId, setSendingId] = useState<string | null>(null);

  const resetForm = () => {
    setName("");
    setMac("");
    setBroadcastAddress("");
    setPort("");
    setEditingId(null);
  };

  const startAdd = () => {
    resetForm();
    setMode("add");
  };

  const startEdit = (device: WakeOnLanDevice) => {
    setEditingId(device.id);
    setName(device.name);
    setMac(device.mac);
    setBroadcastAddress(device.broadcastAddress ?? "");
    setPort(device.port ? String(device.port) : "");
    setMode("edit");
  };

  const handleSave = () => {
    if (!name.trim() || !mac.trim()) {
      toast("Name and MAC address are required", "error");
      return;
    }

    const device: WakeOnLanDevice = {
      id: editingId ?? generateId(),
      name: name.trim(),
      mac: mac.trim(),
      broadcastAddress: broadcastAddress.trim() || undefined,
      port: port.trim() ? Number(port.trim()) || 9 : undefined,
    };

    if (mode === "add") {
      setWolDevices([...wolDevices, device]);
      toast(`${device.name} added`, "success");
    } else {
      setWolDevices(wolDevices.map((d) => (d.id === editingId ? device : d)));
      toast(`${device.name} updated`, "success");
    }

    resetForm();
    setMode("list");
  };

  const handleDelete = (device: WakeOnLanDevice) => {
    Alert.alert(
      "Delete Device",
      `Remove "${device.name}" from Wake-on-LAN?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setWolDevices(wolDevices.filter((d) => d.id !== device.id));
            toast(`${device.name} removed`, "success");
          },
        },
      ],
    );
  };

  const handleWake = async (device: WakeOnLanDevice) => {
    setSendingId(device.id);
    try {
      await sendWakeOnLan({
        mac: device.mac,
        broadcastAddress: device.broadcastAddress,
        port: device.port,
      });
      toast(`Magic packet sent to ${device.name}`, "success");
    } catch (err) {
      const msg =
        err instanceof WakeOnLanError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to send magic packet";
      toast(msg, "error");
    } finally {
      setSendingId(null);
    }
  };

  if (mode === "add" || mode === "edit") {
    return (
      <ScreenWrapper>
        <View className="flex-row items-center mb-4 mt-2">
          <Pressable
            onPress={() => { resetForm(); setMode("list"); }}
            className="mr-3 active:opacity-70 p-1"
          >
            <ArrowLeft size={22} color="#e4e4e7" />
          </Pressable>
          <Text className="text-zinc-100 text-xl font-bold">
            {mode === "add" ? "Add Device" : "Edit Device"}
          </Text>
        </View>

        <Card className="gap-4 mb-4">
          <TextInput
            label="Device Name"
            placeholder="e.g. Media Server"
            value={name}
            onChangeText={setName}
          />
          <TextInput
            label="MAC Address"
            placeholder="00:11:22:33:44:55"
            value={mac}
            onChangeText={setMac}
            autoCapitalize="none"
          />
          <TextInput
            label="Broadcast Address"
            placeholder="192.168.1.255"
            value={broadcastAddress}
            onChangeText={setBroadcastAddress}
            keyboardType="url"
          />
          <TextInput
            label="Port"
            placeholder="9"
            value={port}
            onChangeText={setPort}
            keyboardType="number-pad"
          />
        </Card>

        <View className="flex-row gap-3">
          <Button
            label="Cancel"
            onPress={() => { resetForm(); setMode("list"); }}
            variant="outline"
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

  return (
    <ScreenWrapper>
      <View className="flex-row items-center mb-4 mt-2">
        <Pressable onPress={() => router.back()} className="mr-3 active:opacity-70 p-1">
          <ArrowLeft size={22} color="#e4e4e7" />
        </Pressable>
        <Text className="text-zinc-100 text-xl font-bold flex-1">Wake-on-LAN</Text>
        <Pressable onPress={startAdd} className="active:opacity-70 p-1">
          <Plus size={22} color="#3b82f6" />
        </Pressable>
      </View>

      {!wolDevices.length ? (
        <View className="items-center justify-center py-20 gap-3">
          <Zap size={40} color="#3f3f46" />
          <Text className="text-zinc-400 text-base text-center">
            No devices configured
          </Text>
          <Text className="text-zinc-500 text-sm text-center">
            Add a device to send Wake-on-LAN magic packets.
          </Text>
          <Button
            label="Add Device"
            onPress={startAdd}
            icon={<Plus size={16} color="#fff" />}
            size="sm"
          />
        </View>
      ) : (
        <View className="gap-3">
          {wolDevices.map((device) => (
            <Card key={device.id} className="gap-3">
              <View className="flex-row items-center">
                <View className="bg-surface-light rounded-xl p-2.5 mr-3">
                  <Zap size={20} color="#a1a1aa" />
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-100 text-base font-medium">{device.name}</Text>
                  <Text className="text-zinc-500 text-xs">{device.mac}</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable onPress={() => startEdit(device)} className="p-2 active:opacity-70">
                    <Pencil size={16} color="#71717a" />
                  </Pressable>
                  <Pressable onPress={() => handleDelete(device)} className="p-2 active:opacity-70">
                    <Trash2 size={16} color="#71717a" />
                  </Pressable>
                </View>
              </View>
              <Button
                label={`Wake ${device.name}`}
                onPress={() => handleWake(device)}
                variant="outline"
                size="sm"
                loading={sendingId === device.id}
                icon={<Zap size={14} color="#a1a1aa" />}
              />
            </Card>
          ))}
        </View>
      )}
    </ScreenWrapper>
  );
}
