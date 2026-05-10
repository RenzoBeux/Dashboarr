import { useState } from "react";
import { View } from "react-native";
import { TriangleAlert } from "lucide-react-native";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { Toggle } from "@/components/ui/toggle";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useEnabledInstances } from "@/hooks/use-instance-target";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  resolveBoundInstances,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";

export interface SpeedStatsSettingsValue extends Record<string, unknown> {
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
}

export const SPEED_STATS_DEFAULT_SETTINGS: SpeedStatsSettingsValue = {
  instanceIds: INSTANCE_BINDING_ALL,
  includeSab: false,
  sabInstanceIds: INSTANCE_BINDING_ALL,
};

export function SpeedStatsSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<SpeedStatsSettingsValue>(
    slotId,
    SPEED_STATS_DEFAULT_SETTINGS,
  );
  const qbitInstances = useEnabledInstances("qbittorrent");
  const sabInstances = useEnabledInstances("sabnzbd");
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
      {qbitInstances.length > 0 && (
        <InstancePickerRow
          serviceId="qbittorrent"
          value={settings.instanceIds}
          onChange={(instanceIds) => update({ instanceIds })}
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
