import { useState } from "react";
import { View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { Toggle } from "@/components/ui/toggle";
import { TextInput } from "@/components/ui/text-input";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  resolveBoundInstances,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  NetworkInterfacePickerRow,
  NETWORK_INTERFACES_ALL,
  type NetworkInterfacesValue,
} from "@/components/dashboard/widget-settings/network-interface-picker-row";
import {
  ChipGroup,
  SettingsSection,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";

// Which counter the "X GB total" subtitle reflects on the pill.
//   alltime — qBittorrent's lifetime totals (alltime_dl/alltime_ul). Survives
//             qBit restarts. Default — matches qB's own User Statistics view.
//   session — per-session totals (dl_info_data/up_info_data). Resets every
//             time qBit restarts. Old pre-#104 behavior.
//   both    — render both rows stacked under the speed.
export type SpeedStatsTotalsScope = "alltime" | "session" | "both";

const TOTALS_SCOPE_OPTIONS: readonly { value: SpeedStatsTotalsScope; label: string }[] = [
  { value: "alltime", label: "All-time" },
  { value: "session", label: "Session" },
  { value: "both", label: "Both" },
];

// A widget shows ONE source at a time, so its purpose is unambiguous and the
// pills never double-count (download-client traffic flows through the same NIC
// Glances reports, so summing them would count it twice). Place several widgets
// with different titles for different purposes.
//   clients — qBittorrent / SABnzbd / rTorrent transfer speeds.
//   network — Glances interface throughput (received → down, sent → up).
export type SpeedStatsSource = "clients" | "network";

const SOURCE_OPTIONS: readonly { value: SpeedStatsSource; label: string }[] = [
  { value: "clients", label: "Download clients" },
  { value: "network", label: "Server network" },
];

export interface SpeedStatsSettingsValue extends Record<string, unknown> {
  // Optional label shown above the pills (like the service widgets' titles).
  // Empty = no header. Lets a user place several Speed Stats widgets for
  // different purposes ("Torrents", "Internet", …).
  title: string;
  // Which single data source the widget shows. See SpeedStatsSource.
  source: SpeedStatsSource;
  // Which qBittorrent instances to graph. "all" sums every enabled instance's
  // speeds into one card; an array of UUIDs sums just those servers.
  instanceIds: InstanceBindingValue;
  // Whether to also include SABnzbd instances in the summed speed pill. Off by
  // default to preserve the prior qBit-only behavior — SAB has no upload, so
  // turning it on makes the down pill stack-wide and leaves the up pill alone.
  includeSab: boolean;
  // Which SAB instances to fold in when `includeSab` is on. Same shape as
  // `instanceIds`; "all" auto-includes newly-added SAB instances.
  sabInstanceIds: InstanceBindingValue;
  // Which transfer-counter the subtitle reflects. See SpeedStatsTotalsScope.
  totalsScope: SpeedStatsTotalsScope;
  // Which Glances instances to read interfaces from (when source = network).
  glancesInstanceIds: InstanceBindingValue;
  // Which interfaces to sum. "all" = every active, non-loopback, real interface.
  glancesInterfaces: NetworkInterfacesValue;
}

export const SPEED_STATS_DEFAULT_SETTINGS: SpeedStatsSettingsValue = {
  title: "",
  source: "clients",
  instanceIds: INSTANCE_BINDING_ALL,
  includeSab: false,
  sabInstanceIds: INSTANCE_BINDING_ALL,
  totalsScope: "alltime",
  glancesInstanceIds: INSTANCE_BINDING_ALL,
  glancesInterfaces: NETWORK_INTERFACES_ALL,
};

/**
 * The source actually used, given what's configured. When only one kind is
 * available the choice is forced (so a Glances-only setup shows network without
 * the user touching the selector); when both are configured the stored choice
 * wins. Shared by the card and the settings panel so they never disagree.
 */
export function resolveSpeedStatsSource(
  source: SpeedStatsSource,
  hasClients: boolean,
  hasGlances: boolean,
): SpeedStatsSource {
  if (hasClients && hasGlances) return source;
  if (hasGlances) return "network";
  return "clients";
}

export function SpeedStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );
  const qbitInstances = useEnabledInstances("qbittorrent");
  const sabInstances = useEnabledInstances("sabnzbd");
  const rtInstances = useEnabledInstances("rtorrent");
  const glancesInstances = useEnabledInstances("glances");
  const hasClients =
    qbitInstances.length + sabInstances.length + rtInstances.length > 0;
  const hasGlances = glancesInstances.length > 0;
  const source = resolveSpeedStatsSource(settings.source, hasClients, hasGlances);
  const [showSabWarning, setShowSabWarning] = useState(false);

  // SAB exposes neither a session nor lifetime data counter the way qBit does
  // (the `queue` envelope only carries instantaneous `kbpersec`), so the moment
  // a user folds SAB into a card that already has a qBit binding, the "X total"
  // subtitle becomes incomplete. Surface that explicitly the first time they
  // flip the toggle on so they don't read the qBit number as a stack total.
  const hasBoundQbit =
    resolveBoundInstances(settings.instanceIds, qbitInstances).length > 0;

  const handleIncludeSabChange = (next: boolean) => {
    if (next && hasBoundQbit && !settings.includeSab) {
      setShowSabWarning(true);
      return;
    }
    update({ includeSab: next });
  };

  const confirmSabWarning = () => {
    setShowSabWarning(false);
    update({ includeSab: true });
  };

  // When no qBit is configured, the "Include SABnzbd" toggle is moot — the
  // card auto-includes SAB anyway since it's the only source. Show the SAB
  // picker directly in that case so the setting matches what the card does.
  const sabIsOnlySource = qbitInstances.length === 0 && sabInstances.length > 0;

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Title">
        <TextInput
          placeholder="e.g. Torrents, Internet"
          value={settings.title}
          onChangeText={(title) => update({ title })}
          maxLength={24}
          returnKeyType="done"
        />
      </SettingsSection>

      {hasClients && hasGlances && (
        <ChipGroup
          label="Source"
          options={SOURCE_OPTIONS}
          value={source}
          onChange={(next) => update({ source: next })}
        />
      )}

      {source === "clients" && (
        <>
          {qbitInstances.length > 0 && (
            <InstancePickerRow
              serviceId="qbittorrent"
              value={settings.instanceIds}
              onChange={(instanceIds) => update({ instanceIds })}
            />
          )}

          {qbitInstances.length > 0 && (
            <ChipGroup
              label="Totals shown"
              options={TOTALS_SCOPE_OPTIONS}
              value={settings.totalsScope}
              onChange={(totalsScope) => update({ totalsScope })}
            />
          )}

          {sabInstances.length > 0 && !sabIsOnlySource && (
            <>
              <Toggle
                label="Include SABnzbd"
                description="Adds Usenet download speed to the down pill. SAB has no uploads and no lifetime total."
                value={settings.includeSab}
                onValueChange={handleIncludeSabChange}
              />

              {settings.includeSab && (
                <InstancePickerRow
                  serviceId="sabnzbd"
                  value={settings.sabInstanceIds}
                  onChange={(sabInstanceIds) => update({ sabInstanceIds })}
                />
              )}
            </>
          )}

          {sabIsOnlySource && (
            <InstancePickerRow
              serviceId="sabnzbd"
              value={settings.sabInstanceIds}
              onChange={(sabInstanceIds) => update({ sabInstanceIds })}
            />
          )}
        </>
      )}

      {source === "network" && hasGlances && (
        <>
          <InstancePickerRow
            serviceId="glances"
            value={settings.glancesInstanceIds}
            onChange={(glancesInstanceIds) => update({ glancesInstanceIds })}
          />
          <NetworkInterfacePickerRow
            instanceIds={settings.glancesInstanceIds}
            value={settings.glancesInterfaces}
            onChange={(glancesInterfaces) => update({ glancesInterfaces })}
          />
        </>
      )}

      <ConfirmModal
        visible={showSabWarning}
        title="Lifetime total won't include SAB"
        message="SABnzbd's API doesn't expose a lifetime data counter, so the 'total' shown under the download speed will only reflect your qBittorrent instances. Live speed will still be the combined total."
        icon={TriangleAlert}
        confirmLabel="Add SABnzbd"
        onConfirm={confirmSabWarning}
        onCancel={() => setShowSabWarning(false)}
      />
    </View>
  );
}
