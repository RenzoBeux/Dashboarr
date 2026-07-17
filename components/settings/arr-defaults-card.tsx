import { View, Text } from "react-native";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { formatBytes } from "@/lib/utils";
import { useConfigStore } from "@/store/config-store";
import { useTargetInstance } from "@/hooks/use-instance-target";
import {
  useRadarrQualityProfiles,
  useRadarrRootFolders,
} from "@/hooks/use-radarr";
import {
  useSonarrQualityProfiles,
  useSonarrRootFolders,
} from "@/hooks/use-sonarr";
import {
  useLidarrQualityProfiles,
  useLidarrRootFolders,
  useLidarrMetadataProfiles,
} from "@/hooks/use-lidarr";
import type { ServiceId } from "@/lib/constants";

// arr profile/metadata ids are always >= 1 and root-folder paths are non-empty,
// so these sentinels safely mean "no stored default — use first in list".
const FIRST_IN_LIST_ID = -1;
const FIRST_IN_LIST_PATH = "";

interface Profile {
  id: number;
  name: string;
}
interface Folder {
  path: string;
  freeSpace: number;
}

/**
 * Per-instance defaults for the Radarr/Sonarr/Lidarr add flows (#287): the
 * Quality Profile, Root Folder, and (Lidarr) Metadata Profile that get
 * preselected in the add sheet. Renders nothing for other service kinds so the
 * caller can drop it in unconditionally. Each field persists on change via
 * `updateInstance`, matching the connection toggles above it — no dirty state.
 */
export function ArrDefaultsCard({
  serviceId,
  instanceId,
}: {
  serviceId: ServiceId;
  instanceId: string;
}) {
  switch (serviceId) {
    case "radarr":
      return <RadarrDefaults instanceId={instanceId} />;
    case "sonarr":
      return <SonarrDefaults instanceId={instanceId} />;
    case "lidarr":
      return <LidarrDefaults instanceId={instanceId} />;
    default:
      return null;
  }
}

// One thin wrapper per kind so the (conditionally-called) service hooks stay at
// the top level. Each resolves its instance-scoped profiles/folders and hands
// them to the shared body.
function RadarrDefaults({ instanceId }: { instanceId: string }) {
  const { data: profiles } = useRadarrQualityProfiles(instanceId);
  const { data: folders } = useRadarrRootFolders(instanceId);
  return (
    <DefaultsCardBody
      serviceId="radarr"
      instanceId={instanceId}
      profiles={profiles}
      folders={folders}
    />
  );
}

function SonarrDefaults({ instanceId }: { instanceId: string }) {
  const { data: profiles } = useSonarrQualityProfiles(instanceId);
  const { data: folders } = useSonarrRootFolders(instanceId);
  return (
    <DefaultsCardBody
      serviceId="sonarr"
      instanceId={instanceId}
      profiles={profiles}
      folders={folders}
    />
  );
}

function LidarrDefaults({ instanceId }: { instanceId: string }) {
  const { data: profiles } = useLidarrQualityProfiles(instanceId);
  const { data: folders } = useLidarrRootFolders(instanceId);
  const { data: metadataProfiles } = useLidarrMetadataProfiles(instanceId);
  return (
    <DefaultsCardBody
      serviceId="lidarr"
      instanceId={instanceId}
      profiles={profiles}
      folders={folders}
      metadataProfiles={metadataProfiles}
    />
  );
}

function DefaultsCardBody({
  serviceId,
  instanceId,
  profiles,
  folders,
  metadataProfiles,
}: {
  serviceId: ServiceId;
  instanceId: string;
  profiles: Profile[] | undefined;
  folders: Folder[] | undefined;
  metadataProfiles?: Profile[] | undefined;
}) {
  const inst = useTargetInstance(serviceId, instanceId);
  const updateInstance = useConfigStore((s) => s.updateInstance);

  const hasProfiles = !!profiles?.length;
  const hasFolders = !!folders?.length;
  const hasMetadata = !!metadataProfiles?.length;
  const showMetadata = serviceId === "lidarr";
  // Nothing came back from the server — disabled instance, missing credentials,
  // or unreachable. Show the fields (as sentinel "First in list") plus a hint.
  const nothingLoaded = !hasProfiles && !hasFolders && (!showMetadata || !hasMetadata);

  return (
    <Card className="gap-4 mb-4">
      <View className="gap-1">
        <Text className="text-zinc-400 text-xs font-semibold uppercase tracking-wider">
          Add Defaults
        </Text>
        <Text className="text-zinc-500 text-xs">
          Preselected when adding new content from this instance.
        </Text>
      </View>

      <Select<number>
        label="Quality Profile"
        value={inst?.defaultQualityProfileId ?? FIRST_IN_LIST_ID}
        disabled={!hasProfiles}
        options={[
          {
            value: FIRST_IN_LIST_ID,
            label: "First in list",
            description: "Use the server's first profile (default)",
          },
          ...(profiles?.map((p) => ({ value: p.id, label: p.name })) ?? []),
        ]}
        onChange={(v) =>
          updateInstance(serviceId, instanceId, {
            defaultQualityProfileId: v === FIRST_IN_LIST_ID ? undefined : v,
          })
        }
      />

      {showMetadata ? (
        <Select<number>
          label="Metadata Profile"
          value={inst?.defaultMetadataProfileId ?? FIRST_IN_LIST_ID}
          disabled={!hasMetadata}
          options={[
            {
              value: FIRST_IN_LIST_ID,
              label: "First in list",
              description: "Use the server's first profile (default)",
            },
            ...(metadataProfiles?.map((p) => ({ value: p.id, label: p.name })) ?? []),
          ]}
          onChange={(v) =>
            updateInstance(serviceId, instanceId, {
              defaultMetadataProfileId: v === FIRST_IN_LIST_ID ? undefined : v,
            })
          }
        />
      ) : null}

      <Select<string>
        label="Root Folder"
        value={inst?.defaultRootFolderPath ?? FIRST_IN_LIST_PATH}
        disabled={!hasFolders}
        options={[
          {
            value: FIRST_IN_LIST_PATH,
            label: "First in list",
            description: "Use the server's first folder (default)",
          },
          ...(folders?.map((f) => ({
            value: f.path,
            label: f.path,
            description: `${formatBytes(f.freeSpace)} free`,
          })) ?? []),
        ]}
        onChange={(v) =>
          updateInstance(serviceId, instanceId, {
            defaultRootFolderPath: v === FIRST_IN_LIST_PATH ? undefined : v,
          })
        }
      />

      {nothingLoaded ? (
        <Text className="text-zinc-500 text-xs">
          Profiles and folders load from the server. Save the connection above,
          then make sure this instance is enabled and reachable.
        </Text>
      ) : null}
    </Card>
  );
}
