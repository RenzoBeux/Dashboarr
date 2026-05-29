import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Zap, Plus, Pencil, Trash2, X } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { toast, toastError } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useConfigStore } from "@/store/config-store";
import { sendWakeOnLan } from "@/lib/wake-on-lan";
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
  const [pendingDelete, setPendingDelete] = useState<WakeOnLanDevice | null>(
    null,
  );

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

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setWolDevices(wolDevices.filter((d) => d.id !== pendingDelete.id));
    toast(`${pendingDelete.name} removed`, "success");
    setPendingDelete(null);
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
      toastError("Failed to send magic packet", err);
    } finally {
      setSendingId(null);
    }
  };

  if (mode === "add" || mode === "edit") {
    return (
      <ScreenWrapper>
        <BackHeader
          title={mode === "add" ? "Add Device" : "Edit Device"}
          onBack={() => { resetForm(); setMode("list"); }}
        />

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
      <BackHeader
        title="Wake-on-LAN"
        right={
          <Pressable onPress={startAdd} className="active:opacity-70 p-1">
            <Icon icon={Plus} size={22} color="#3b82f6" />
          </Pressable>
        }
      />

      {!wolDevices.length ? (
        <View className="items-center justify-center py-20 gap-3">
          <Icon icon={Zap} size={40} color="#3f3f46" />
          <Text className="text-zinc-400 text-base text-center">
            No devices configured
          </Text>
          <Text className="text-zinc-500 text-sm text-center">
            Add a device to send Wake-on-LAN magic packets.
          </Text>
          <Button
            label="Add Device"
            onPress={startAdd}
            icon={<Icon icon={Plus} size={16} color="#fff" />}
            size="sm"
          />
        </View>
      ) : (
        <View className="gap-3">
          {wolDevices.map((device) => (
            <Card key={device.id} className="gap-3">
              <View className="flex-row items-center">
                <View className="bg-surface-light rounded-xl p-2.5 mr-3">
                  <Icon icon={Zap} size={20} color="#a1a1aa" />
                </View>
                <View className="flex-1">
                  <Text className="text-zinc-100 text-base font-medium">{device.name}</Text>
                  <Text className="text-zinc-500 text-xs">{device.mac}</Text>
                </View>
                <View className="flex-row items-center gap-1">
                  <Pressable onPress={() => startEdit(device)} className="p-2 active:opacity-70">
                    <Icon icon={Pencil} size={16} color="#71717a" />
                  </Pressable>
                  <Pressable onPress={() => setPendingDelete(device)} className="p-2 active:opacity-70">
                    <Icon icon={Trash2} size={16} color="#71717a" />
                  </Pressable>
                </View>
              </View>
              <Button
                label={`Wake ${device.name}`}
                onPress={() => handleWake(device)}
                variant="outline"
                size="sm"
                loading={sendingId === device.id}
                icon={<Icon icon={Zap} size={14} color="#a1a1aa" />}
              />
            </Card>
          ))}
        </View>
      )}

      <ConfirmModal
        visible={pendingDelete !== null}
        title="Delete Device"
        message={
          pendingDelete
            ? `Remove "${pendingDelete.name}" from Wake-on-LAN?`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenWrapper>
  );
}
