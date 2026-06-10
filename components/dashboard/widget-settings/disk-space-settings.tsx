import { View } from "react-native";
import { TextInput } from "@/components/ui/text-input";
import { useWidgetSettings } from "@/hooks/use-widget-settings";
import { useAttachedEnabledInstances } from "@/hooks/use-workspace-instances";
import type { WidgetSettingsComponentProps } from "@/components/dashboard/widget-registry";
import {
  InstancePickerRow,
  INSTANCE_BINDING_ALL,
  type InstanceBindingValue,
} from "@/components/dashboard/widget-settings/instance-picker-row";
import {
  DiskPathPickerRow,
  DISK_PATHS_ALL,
  type DiskPathsValue,
} from "@/components/dashboard/widget-settings/disk-path-picker-row";
import {
  ChipGroup,
  SettingsSection,
} from "@/components/dashboard/widget-settings/widget-settings-blocks";
import { SERVICE_DEFAULTS } from "@/lib/constants";

// A widget shows ONE source service at a time — Radarr and Sonarr on the same
// box report the same mounts, so merging sources would duplicate disks (or
// need fragile path dedupe). Place several widgets for several servers.
export type DiskSpaceSource = "radarr" | "sonarr" | "lidarr";

const DISK_SPACE_SOURCES: readonly DiskSpaceSource[] = [
  "radarr",
  "sonarr",
  "lidarr",
];

const SOURCE_OPTIONS: readonly { value: DiskSpaceSource; label: string }[] =
  DISK_SPACE_SOURCES.map((value) => ({
    value,
    label: SERVICE_DEFAULTS[value].name,
  }));

export interface DiskSpaceSettingsValue extends Record<string, unknown> {
  // Optional header override. Empty = "Disk Space". Lets a user place several
  // widgets for different servers ("Media NAS", "Seedbox", …).
  title: string;
  // Which single source service the widget reads /diskspace from.
  source: DiskSpaceSource;
  // Per-source bindings (speed-stats precedent: separate instanceIds fields
  // per kind) so flipping the source chip never leaves foreign UUIDs in the
  // active binding.
  radarrInstanceIds: InstanceBindingValue;
  sonarrInstanceIds: InstanceBindingValue;
  lidarrInstanceIds: InstanceBindingValue;
  // Which mounts to show. "all" = every reported mount; an array of path
  // strings restricts the list, applied per-instance.
  paths: DiskPathsValue;
}

export const DISK_SPACE_DEFAULT_SETTINGS: DiskSpaceSettingsValue = {
  title: "",
  source: "radarr",
  radarrInstanceIds: INSTANCE_BINDING_ALL,
  sonarrInstanceIds: INSTANCE_BINDING_ALL,
  lidarrInstanceIds: INSTANCE_BINDING_ALL,
  paths: DISK_PATHS_ALL,
};

/**
 * The source actually used, given what's configured on this workspace. The
 * stored choice wins when that kind is available; otherwise it's forced to the
 * first configured kind (radarr → sonarr → lidarr). Shared by the card and the
 * settings panel so they never disagree — mirrors resolveSpeedStatsSource.
 */
export function resolveDiskSpaceSource(
  source: DiskSpaceSource,
  available: Record<DiskSpaceSource, boolean>,
): DiskSpaceSource {
  if (available[source]) return source;
  return DISK_SPACE_SOURCES.find((s) => available[s]) ?? source;
}

/** The instance binding field matching the given source. */
export function diskSpaceBindingFor(
  settings: DiskSpaceSettingsValue,
  source: DiskSpaceSource,
): InstanceBindingValue {
  switch (source) {
    case "radarr":
      return settings.radarrInstanceIds;
    case "sonarr":
      return settings.sonarrInstanceIds;
    case "lidarr":
      return settings.lidarrInstanceIds;
  }
}

const BINDING_FIELD: Record<
  DiskSpaceSource,
  "radarrInstanceIds" | "sonarrInstanceIds" | "lidarrInstanceIds"
> = {
  radarr: "radarrInstanceIds",
  sonarr: "sonarrInstanceIds",
  lidarr: "lidarrInstanceIds",
};

export function DiskSpaceSettings({ slotId }: WidgetSettingsComponentProps) {
  const { settings, update } = useWidgetSettings<DiskSpaceSettingsValue>(
    slotId,
    DISK_SPACE_DEFAULT_SETTINGS,
  );
  // Scoped to the active workspace so the source chips and pickers match what
  // the card actually renders (#148 pattern).
  const radarrInstances = useAttachedEnabledInstances("radarr");
  const sonarrInstances = useAttachedEnabledInstances("sonarr");
  const lidarrInstances = useAttachedEnabledInstances("lidarr");
  const available: Record<DiskSpaceSource, boolean> = {
    radarr: radarrInstances.length > 0,
    sonarr: sonarrInstances.length > 0,
    lidarr: lidarrInstances.length > 0,
  };
  const source = resolveDiskSpaceSource(settings.source, available);
  const configuredKinds = DISK_SPACE_SOURCES.filter((s) => available[s]);

  return (
    <View className="px-4 py-2 gap-5">
      <SettingsSection label="Title">
        <TextInput
          placeholder="e.g. Media NAS"
          value={settings.title}
          onChangeText={(title) => update({ title })}
          maxLength={24}
          returnKeyType="done"
        />
      </SettingsSection>

      {configuredKinds.length > 1 && (
        <ChipGroup
          label="Source"
          options={SOURCE_OPTIONS.filter((o) => available[o.value])}
          value={source}
          // The stored paths belong to the previous server's mounts — reset to
          // "all" so switching source never shows an empty, mystery-filtered card.
          onChange={(next) => update({ source: next, paths: DISK_PATHS_ALL })}
        />
      )}

      {available[source] && (
        <>
          <InstancePickerRow
            serviceId={source}
            value={diskSpaceBindingFor(settings, source)}
            onChange={(binding) => update({ [BINDING_FIELD[source]]: binding })}
          />
          <DiskPathPickerRow
            source={source}
            instanceIds={diskSpaceBindingFor(settings, source)}
            value={settings.paths}
            onChange={(paths) => update({ paths })}
          />
        </>
      )}
    </View>
  );
}
