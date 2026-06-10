import { useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Wifi, Plus, Pencil, Trash2, Activity, ChevronDown, ChevronUp } from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { lightHaptic } from "@/lib/haptics";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/text-input";
import { toast } from "@/components/ui/toast";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { useConfigStore } from "@/store/config-store";
import { detectWifi, validateHomeNetworkInput } from "@/lib/wifi";
import { detectVpnActive, isVpnModuleAvailable } from "@/lib/vpn";
import type { HomeNetwork } from "@/store/config-store";
import { MAX_HOME_NETWORKS } from "@/lib/constants";
import { resolveDashboardColor } from "@/lib/dashboard-colors";

type Mode = "list" | "add" | "edit";

// One label/value line in the Network diagnostics panel. Kept compact so the
// whole panel is screenshot-friendly for bug reports.
function DiagRow({
  label,
  value,
  bad,
}: {
  label: string;
  value: string;
  bad?: boolean;
}) {
  return (
    <View className="flex-row justify-between items-center">
      <Text className="text-zinc-500 text-xs">{label}</Text>
      <Text
        className={`text-xs font-medium ${bad ? "text-amber-400" : "text-zinc-200"}`}
      >
        {value}
      </Text>
    </View>
  );
}

export default function HomeNetworksScreen() {
  const homeNetworks = useConfigStore((s) => s.homeNetworks);
  const treatVpnAsHome = useConfigStore((s) => s.treatVpnAsHome);
  const addHomeNetwork = useConfigStore((s) => s.addHomeNetwork);
  const updateHomeNetwork = useConfigStore((s) => s.updateHomeNetwork);
  const removeHomeNetwork = useConfigStore((s) => s.removeHomeNetwork);
  const dashboards = useConfigStore((s) => s.dashboards);

  // Network diagnostics (#185): the home/away machine is otherwise invisible.
  // Surfaced as a collapsed panel so it's out of the way day-to-day but easy to
  // expand and screenshot when triaging a "wrong URL / can't reach service" report.
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const isOnWifi = useConfigStore((s) => s.isOnWifi);
  const isVpnActive = useConfigStore((s) => s.isVpnActive);
  const networkAwayFromHome = useConfigStore((s) => s.networkAwayFromHome);
  // A live native read, independent of the cached store flag — if these two
  // disagree, the store just hasn't re-evaluated yet.
  const liveVpn = detectVpnActive();
  const vpnModule = isVpnModuleAvailable();
  const [diagOpen, setDiagOpen] = useState(false);

  // Read-only cross-reference: which workspaces use each network (#148). A
  // dashboard with `homeNetworkIds === undefined` uses ALL networks; one with a
  // selection uses only the ids it lists. Surfaced as color pills so the user
  // can see a network's reach without leaving this screen.
  const usageByNetworkId = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }[]>();
    for (const net of homeNetworks) map.set(net.id, []);
    for (const d of dashboards) {
      const usesAll = d.homeNetworkIds === undefined;
      const selected = usesAll ? null : new Set(d.homeNetworkIds);
      const info = { id: d.id, name: d.name, color: resolveDashboardColor(d.color) };
      for (const net of homeNetworks) {
        if (usesAll || selected!.has(net.id)) map.get(net.id)!.push(info);
      }
    }
    return map;
  }, [dashboards, homeNetworks]);
  const dashboardCount = dashboards.length;

  const [mode, setMode] = useState<Mode>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [ssid, setSsid] = useState("");
  const [bssid, setBssid] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<HomeNetwork | null>(null);

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
    // Shared with the per-dashboard override editor so both apply identical
    // SSID/BSSID/duplicate rules (#148).
    const result = validateHomeNetworkInput(ssid, bssid, homeNetworks, editingId);
    if (!result.ok) {
      toast(result.error, "error");
      return;
    }

    if (mode === "add") {
      if (homeNetworks.length >= MAX_HOME_NETWORKS) {
        toast(`Maximum of ${MAX_HOME_NETWORKS} networks reached`, "error");
        return;
      }
      addHomeNetwork({ ssid: result.ssid, bssid: result.bssid });
      toast(`${result.ssid} added`, "success");
    } else if (editingId) {
      updateHomeNetwork(editingId, { ssid: result.ssid, bssid: result.bssid });
      toast(`${result.ssid} updated`, "success");
    }

    resetForm();
    setMode("list");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    removeHomeNetwork(pendingDelete.id);
    toast(`${pendingDelete.ssid} removed`, "success");
    setPendingDelete(null);
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
                <Icon icon={Wifi} size={20} color="#a1a1aa" />
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

        {mode === "edit" && editingId && (
          <View className="mb-4 gap-2">
            <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
              Used by
            </Text>
            <UsedByPills
              users={usageByNetworkId.get(editingId) ?? []}
              dashboardCount={dashboardCount}
            />
            <Text className="text-zinc-600 text-xs leading-4">
              Choose which workspaces use this network from each dashboard's
              settings. Workspaces using all networks are included automatically.
            </Text>
          </View>
        )}

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
            <Icon icon={Plus} size={22} color="#3b82f6" />
          </Pressable>
        }
      />

      {/* Collapsed by default — a screenshot aid for bug reports (#185). */}
      <Card className="mb-4">
        <Pressable
          onPress={() => {
            lightHaptic();
            setDiagOpen((v) => !v);
          }}
          className="flex-row items-center justify-between active:opacity-70"
        >
          <View className="flex-row items-center gap-2">
            <Icon icon={Activity} size={16} color="#a1a1aa" />
            <Text className="text-zinc-300 text-sm font-semibold">
              Network diagnostics
            </Text>
          </View>
          <View className="flex-row items-center gap-2">
            {!diagOpen ? (
              <Text className="text-zinc-600 text-xs">For bug reports</Text>
            ) : null}
            <Icon icon={diagOpen ? ChevronUp : ChevronDown} size={18} color="#71717a" />
          </View>
        </Pressable>

        {diagOpen ? (
          <Animated.View entering={FadeIn.duration(150)} className="gap-1 mt-3">
            <DiagRow label="Platform" value={Platform.OS} />
            <DiagRow
              label="VPN native module"
              value={vpnModule ? "present" : "MISSING (needs native rebuild)"}
              bad={!vpnModule}
            />
            <DiagRow
              label="VPN detected (live)"
              value={liveVpn ? "yes" : "no"}
              bad={!liveVpn}
            />
            <DiagRow label="VPN flag (store)" value={isVpnActive ? "yes" : "no"} />
            <DiagRow
              label="On WiFi"
              value={isOnWifi === null ? "unknown" : isOnWifi ? "yes" : "no"}
            />
            <DiagRow label="Auto-switch" value={autoSwitchNetwork ? "on" : "off"} />
            <DiagRow
              label="Treat VPN as home"
              value={treatVpnAsHome ? "on" : "off"}
            />
            <DiagRow
              label="Away from home"
              value={networkAwayFromHome ? "yes (remote-only)" : "no (local OK)"}
              bad={networkAwayFromHome}
            />
          </Animated.View>
        ) : null}
      </Card>

      {!homeNetworks.length ? (
        <View className="items-center justify-center py-20 gap-3">
          <Icon icon={Wifi} size={40} color="#3f3f46" />
          <Text className="text-zinc-400 text-base text-center">
            No home networks configured
          </Text>
          <Text className="text-zinc-500 text-sm text-center px-6">
            Add the WiFi networks you trust as "home". Local URLs are used only
            on these networks
            {treatVpnAsHome
              ? ' or while your VPN is connected ("Treat VPN as home" is on)'
              : ""}
            ; everywhere else the app uses your remote URLs, so your API keys
            are never sent to an untrusted LAN.
          </Text>
          <View className="flex-row gap-2 mt-2">
            <Button
              label="Add current WiFi"
              onPress={handleDetect}
              loading={detecting}
              icon={<Icon icon={Wifi} size={14} color="#fff" />}
              size="sm"
            />
            <Button
              label="Add manually"
              onPress={startAdd}
              variant="outline"
              icon={<Icon icon={Plus} size={14} color="#a1a1aa" />}
              size="sm"
            />
          </View>
        </View>
      ) : (
        <View className="gap-3">
          <Text className="text-zinc-500 text-xs px-1 -mt-1">
            Every workspace uses all of these by default. Open a dashboard's
            settings to use only some — the pills show which workspaces use each.
          </Text>
          {homeNetworks.map((network) => {
            const users = usageByNetworkId.get(network.id) ?? [];
            return (
            <Card key={network.id} className="gap-2">
              <View className="flex-row items-center">
                <View className="bg-surface-light rounded-xl p-2.5 mr-3">
                  <Icon icon={Wifi} size={20} color="#a1a1aa" />
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
                    <Icon icon={Pencil} size={16} color="#71717a" />
                  </Pressable>
                  <Pressable
                    onPress={() => setPendingDelete(network)}
                    className="p-2 active:opacity-70"
                  >
                    <Icon icon={Trash2} size={16} color="#71717a" />
                  </Pressable>
                </View>
              </View>
              <UsedByPills users={users} dashboardCount={dashboardCount} />
            </Card>
            );
          })}
          <View className="flex-row gap-2 mt-1">
            <Button
              label="Add current WiFi"
              onPress={handleDetect}
              loading={detecting}
              variant="outline"
              icon={<Icon icon={Wifi} size={14} color="#a1a1aa" />}
              size="sm"
              className="flex-1"
            />
            <Button
              label="Add manually"
              onPress={startAdd}
              variant="outline"
              icon={<Icon icon={Plus} size={14} color="#a1a1aa" />}
              size="sm"
              className="flex-1"
            />
          </View>
        </View>
      )}

      <ConfirmModal
        visible={pendingDelete !== null}
        title="Remove network"
        message={
          pendingDelete
            ? `Stop treating "${pendingDelete.ssid}" as a home network?`
            : ""
        }
        icon={Trash2}
        tone="danger"
        confirmLabel="Remove"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </ScreenWrapper>
  );
}

interface UsedByPillsProps {
  users: { id: string; name: string; color: string }[];
  dashboardCount: number;
}

// Read-only summary of which workspaces use a network (#148). Collapses to a
// single "all dashboards" chip when every workspace includes it, and warns when
// no workspace does (it would never switch to local anywhere).
function UsedByPills({ users, dashboardCount }: UsedByPillsProps) {
  if (dashboardCount > 0 && users.length === dashboardCount) {
    return (
      <View className="flex-row flex-wrap gap-1.5">
        <View className="rounded-full px-2 py-0.5 border border-border/70 bg-surface-light">
          <Text className="text-[0.65rem] font-medium text-zinc-400">
            Used by all dashboards
          </Text>
        </View>
      </View>
    );
  }
  if (users.length === 0) {
    return (
      <View className="flex-row flex-wrap gap-1.5">
        <View className="rounded-full px-2 py-0.5 border border-amber-500/40 bg-amber-500/10">
          <Text className="text-[0.65rem] font-medium text-amber-500/90">
            Not used by any dashboard
          </Text>
        </View>
      </View>
    );
  }
  return (
    <View className="flex-row flex-wrap gap-1.5">
      {users.map((d) => (
        <View
          key={d.id}
          className="flex-row items-center gap-1 rounded-full px-2 py-0.5 border"
          style={{ borderColor: `${d.color}55`, backgroundColor: `${d.color}1A` }}
        >
          <View
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: d.color }}
          />
          <Text
            className="text-[0.65rem] font-medium"
            style={{ color: d.color }}
            numberOfLines={1}
          >
            {d.name}
          </Text>
        </View>
      ))}
    </View>
  );
}
