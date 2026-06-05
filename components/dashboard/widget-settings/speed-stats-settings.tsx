import { useState } from "react";
import { View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { Toggle } from "@/components/ui/toggle";
import { TextInput } from "@/components/ui/text-input";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useAttachedEnabledInstances } from "@/hooks/use-workspace-instances";
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
  // NZBGet mirror of the SAB pair — download-only, no upload or lifetime total.
  includeNzbget: boolean;
  nzbgetInstanceIds: InstanceBindingValue;
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
  includeNzbget: false,
  nzbgetInstanceIds: INSTANCE_BINDING_ALL,
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
  // Scoped to the active workspace so every source gate (clients/network,
  // SAB/NZBGet toggles, "only source" shortcuts) and the pickers match what the
  // card actually renders (#148).
  const qbitInstances = useAttachedEnabledInstances("qbittorrent");
  const sabInstances = useAttachedEnabledInstances("sabnzbd");
  const nzbgetInstances = useAttachedEnabledInstances("nzbget");
  const rtInstances = useAttachedEnabledInstances("rtorrent");
  const glancesInstances = useAttachedEnabledInstances("glances");
  const hasClients =
    qbitInstances.length +
      sabInstances.length +
      nzbgetInstances.length +
      rtInstances.length >
    0;
  const hasGlances = glancesInstances.length > 0;
  const source = resolveSpeedStatsSource(settings.source, hasClients, hasGlances);

  // SAB/NZBGet expose only an instantaneous download speed (no upload, no
  // lifetime counter), so folding either into a card that already has a qBit
  // binding makes the "X total" subtitle incomplete. Warn the first time the
  // user flips a toggle on. One modal, parameterized by which client.
  const [pendingUsenet, setPendingUsenet] = useState<null | "sab" | "nzbget">(null);
  const usenetLabel = pendingUsenet === "nzbget" ? "NZBGet" : "SABnzbd";
  const hasBoundQbit =
    resolveBoundInstances(settings.instanceIds, qbitInstances).length > 0;

  const handleIncludeSabChange = (next: boolean) => {
    if (next && hasBoundQbit && !settings.includeSab) {
      setPendingUsenet("sab");
      return;
    }
    update({ includeSab: next });
  };

  const handleIncludeNzbgetChange = (next: boolean) => {
    if (next && hasBoundQbit && !settings.includeNzbget) {
      setPendingUsenet("nzbget");
      return;
    }
    update({ includeNzbget: next });
  };

  const confirmUsenetWarning = () => {
    if (pendingUsenet === "sab") update({ includeSab: true });
    else if (pendingUsenet === "nzbget") update({ includeNzbget: true });
    setPendingUsenet(null);
  };

  // When no qBit is configured, the include toggles are moot — the card
  // auto-includes the usenet client anyway since it's the only source. Show the
  // picker directly in that case so the setting matches what the card does.
  const sabIsOnlySource = qbitInstances.length === 0 && sabInstances.length > 0;
  const nzbgetIsOnlySource =
    qbitInstances.length === 0 && nzbgetInstances.length > 0;

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

          {nzbgetInstances.length > 0 && !nzbgetIsOnlySource && (
            <>
              <Toggle
                label="Include NZBGet"
                description="Adds Usenet download speed to the down pill. NZBGet has no uploads and no lifetime total."
                value={settings.includeNzbget}
                onValueChange={handleIncludeNzbgetChange}
              />

              {settings.includeNzbget && (
                <InstancePickerRow
                  serviceId="nzbget"
                  value={settings.nzbgetInstanceIds}
                  onChange={(nzbgetInstanceIds) => update({ nzbgetInstanceIds })}
                />
              )}
            </>
          )}

          {nzbgetIsOnlySource && (
            <InstancePickerRow
              serviceId="nzbget"
              value={settings.nzbgetInstanceIds}
              onChange={(nzbgetInstanceIds) => update({ nzbgetInstanceIds })}
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
        visible={pendingUsenet !== null}
        title={`Lifetime total won't include ${usenetLabel}`}
        message={`${usenetLabel}'s API doesn't expose a lifetime data counter, so the 'total' shown under the download speed will only reflect your qBittorrent instances. Live speed will still be the combined total.`}
        icon={TriangleAlert}
        confirmLabel={`Add ${usenetLabel}`}
        onConfirm={confirmUsenetWarning}
        onCancel={() => setPendingUsenet(null)}
      />
    </View>
  );
}
