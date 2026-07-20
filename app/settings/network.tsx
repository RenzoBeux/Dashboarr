import { router } from "expo-router";
import { Wifi, Zap, Globe } from "lucide-react-native";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { BackHeader } from "@/components/common/back-header";
import { SettingsGroup } from "@/components/settings/settings-group";
import { SettingsRow } from "@/components/settings/settings-row";
import { SettingsToggleRow } from "@/components/settings/settings-toggle-row";
import { useConfigStore } from "@/store/config-store";

export default function NetworkSettingsScreen() {
  const autoSwitchNetwork = useConfigStore((s) => s.autoSwitchNetwork);
  const setAutoSwitch = useConfigStore((s) => s.setAutoSwitch);
  const homeNetworksCount = useConfigStore((s) => s.homeNetworks.length);
  const treatVpnAsHome = useConfigStore((s) => s.treatVpnAsHome);
  const setTreatVpnAsHome = useConfigStore((s) => s.setTreatVpnAsHome);
  const wolDevices = useConfigStore((s) => s.wolDevices);
  const globalHeaderCount = useConfigStore(
    (s) => Object.keys(s.globalCustomHeaders).length,
  );

  return (
    <ScreenWrapper>
      <BackHeader title="Network" />

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
            autoSwitchNetwork && homeNetworksCount === 0 && !treatVpnAsHome
              ? "Add at least one — without it the app stays on remote URLs"
              : homeNetworksCount > 0
                ? `${homeNetworksCount} network${homeNetworksCount > 1 ? "s" : ""} configured`
                : "Configure your home WiFi networks"
          }
          subtitleTone={
            autoSwitchNetwork && homeNetworksCount === 0 && !treatVpnAsHome
              ? "warn"
              : "default"
          }
          onPress={() => router.push("/home-networks")}
        />
        {autoSwitchNetwork ? (
          <SettingsToggleRow
            label="Treat VPN as home"
            description="While a VPN is connected, use local URLs as if on home WiFi. The app can only detect that some VPN is up — enable this only if your VPN reaches your home network."
            value={treatVpnAsHome}
            onValueChange={setTreatVpnAsHome}
          />
        ) : null}
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
    </ScreenWrapper>
  );
}
