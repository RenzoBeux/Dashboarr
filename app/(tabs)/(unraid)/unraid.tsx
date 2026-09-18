import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Container,
  HardDrive,
  Moon,
  Play,
  RotateCw,
  Square,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ActionSheet } from "@/components/ui/action-sheet";
import { toast, toastError } from "@/components/ui/toast";
import {
  useRestartUnraidContainer,
  useStartUnraidContainer,
  useStopUnraidContainer,
  useUnraidContainers,
  useUnraidStorage,
} from "@/hooks/use-unraid";
import { useGlancesDiskIoRates } from "@/hooks/use-glances";
import { normalizeDeviceName } from "@/services/glances-api";
import type { DiskIoRate } from "@/services/glances-api";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useUnraidUiStore } from "@/store/unraid-ui-store";
import { lightHaptic } from "@/lib/haptics";
import { formatBytes, formatSpeed } from "@/lib/utils";
import type { UnraidArrayDisk, UnraidContainer as UnraidContainerType, UnraidPhysicalDisk } from "@/lib/types";

function usageBarColor(percent: number): string {
  if (percent >= 85) return "bg-red-500";
  if (percent >= 70) return "bg-amber-500";
  return "bg-success";
}

function usageTextColor(percent: number): string {
  if (percent >= 85) return "text-red-400";
  if (percent >= 70) return "text-amber-400";
  return "text-success";
}

// ArrayState enum → display style. Anything that isn't cleanly started or
// stopped (NEW_ARRAY, RECON_DISK, DISABLE_DISK, …) reads as a warning.
function arrayStateStyle(state: string): { label: string; text: string } {
  const s = state.toUpperCase();
  if (s === "STARTED") return { label: "Started", text: "text-success" };
  if (s === "STOPPED") return { label: "Stopped", text: "text-zinc-500" };
  const label = state
    ? state.charAt(0).toUpperCase() + state.slice(1).toLowerCase().replace(/_/g, " ")
    : "Unknown";
  return { label, text: "text-amber-400" };
}

// ContainerState enum from the GraphQL schema ("RUNNING" / "EXITED" /
// "PAUSED"). Compared case-insensitively to survive enum-casing drift.
function isContainerRunning(state: string): boolean {
  return state.toUpperCase() === "RUNNING";
}

function containerStateStyle(state: string): { dot: string; text: string } {
  const s = state.toUpperCase();
  if (s === "RUNNING") return { dot: "bg-success", text: "text-success" };
  if (s === "EXITED" || s === "STOPPED") return { dot: "bg-zinc-600", text: "text-zinc-500" };
  // PAUSED / RESTARTING / anything transitional.
  return { dot: "bg-amber-500", text: "text-amber-400" };
}

export default function UnraidScreen() {
  return (
    <WorkspaceServiceGuard kinds={["unraid"]}>
      <UnraidScreenInner />
    </WorkspaceServiceGuard>
  );
}

function UnraidScreenInner() {
  const { data: healthData } = useServiceHealth();
  // glances too: the disk rows show its I/O rates, so a pull should refresh them.
  const { refreshing, onRefresh } = usePullToRefresh([["unraid"], ["glances"]]);
  const unraidHealth = healthData?.find((s) => s.id === "unraid");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="unRAID" online={unraidHealth?.online} serviceId="unraid" />
      <CachedDataBanner serviceId="unraid" label="unRAID" />
      <View className="gap-4">
        <ArrayCard />
        <PoolsCard />
        <UnassignedCard />
        <ContainersCard />
      </View>
    </ScreenWrapper>
  );
}

function ArrayCard() {
  const { data: storage, isLoading } = useUnraidStorage();
  const ioRates = useGlancesDiskIoRates();
  const disksExpanded = useUnraidUiStore((s) => s.arrayDisksExpanded);
  const setDisksExpanded = useUnraidUiStore((s) => s.setArrayDisksExpanded);

  const state = storage ? arrayStateStyle(storage.arrayState) : null;
  const capacity = storage?.capacity;
  const capacityPct =
    capacity && capacity.total > 0 ? (capacity.used / capacity.total) * 100 : 0;
  const diskCount = storage ? storage.parities.length + storage.dataDisks.length : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Array</CardTitle>
        {state && (
          <Text className={`text-sm font-semibold ${state.text}`}>{state.label}</Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : !storage ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-4">
          {capacity && capacity.total > 0 && (
            <View>
              <View className="flex-row items-center justify-between mb-1.5">
                <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  Capacity
                </Text>
                <Text className={`text-sm font-bold ${usageTextColor(capacityPct)}`}>
                  {capacityPct.toFixed(1)}%
                </Text>
              </View>
              <ProgressBar
                progress={capacityPct / 100}
                color={usageBarColor(capacityPct)}
                className="mb-1.5"
              />
              <View className="flex-row gap-3">
                <Text className="text-zinc-500 text-xs">Used {formatBytes(capacity.used)}</Text>
                <Text className="text-zinc-500 text-xs">Free {formatBytes(capacity.free)}</Text>
                <Text className="text-zinc-500 text-xs">Total {formatBytes(capacity.total)}</Text>
              </View>
            </View>
          )}

          {storage.parityCheck?.running && (
            <Text className="text-amber-400 text-xs">
              Parity check
              {typeof storage.parityCheck.progress === "number"
                ? ` · ${storage.parityCheck.progress.toFixed(0)}%`
                : ""}
              {storage.parityCheck.speed ? ` · ${storage.parityCheck.speed}` : ""}
            </Text>
          )}

          {diskCount > 0 && (
            <View>
              <Pressable
                onPress={() => {
                  lightHaptic();
                  setDisksExpanded(!disksExpanded);
                }}
                className="flex-row items-center justify-between active:opacity-70"
              >
                <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  Disks
                </Text>
                <View className="flex-row items-center gap-2">
                  <Text className="text-zinc-600 text-xs">
                    {diskCount} {diskCount === 1 ? "disk" : "disks"}
                  </Text>
                  <Icon
                    icon={disksExpanded ? ChevronUp : ChevronDown}
                    size={16}
                    color="#71717a"
                  />
                </View>
              </Pressable>

              {disksExpanded && (
                <Animated.View entering={FadeIn.duration(150)} className="gap-4 mt-3">
                  {storage.parities.map((disk) => (
                    <ArrayDiskRow
                      key={`parity-${disk.idx}-${disk.name}`}
                      disk={disk}
                      io={diskIo(ioRates, disk.device)}
                      parity
                    />
                  ))}
                  {storage.dataDisks.map((disk) => (
                    <ArrayDiskRow
                      key={`data-${disk.idx}-${disk.name}`}
                      disk={disk}
                      io={diskIo(ioRates, disk.device)}
                    />
                  ))}
                  {/* Name the source: these numbers come from a different
                      service than everything else on the row, and a Glances
                      instance pointed at another host can't be detected. */}
                  {[...storage.parities, ...storage.dataDisks].some((d) =>
                    activeIo(diskIo(ioRates, d.device)),
                  ) && <Text className="text-zinc-600 text-xs">Read/write via Glances</Text>}
                </Animated.View>
              )}
            </View>
          )}
        </View>
      )}
    </Card>
  );
}

// Live read/write for one device, from Glances — unRAID's own API reports
// numReads/numWrites as 0 for every disk (its state parser drops them), and has
// no throughput field at all, so this is the only source for "what is hammering
// the array right now". Rendered as two chips rather than one string so they
// wrap independently alongside the Used/Free/Total triple.
function DiskIoChips({ io }: { io: DiskIoRate }) {
  return (
    <>
      <View className="flex-row items-center gap-1">
        <Icon icon={Activity} size={12} color="#a1a1aa" />
        <Text className="text-zinc-400 text-xs">R {formatSpeed(io.read)}</Text>
      </View>
      <Text className="text-zinc-400 text-xs">W {formatSpeed(io.write)}</Text>
    </>
  );
}

// Only worth showing while the drive is actually doing something — idle disks
// keep the row as clean as it is today (same rule as the Glances Disk I/O card).
function activeIo(io: DiskIoRate | undefined): DiskIoRate | undefined {
  return io && io.read + io.write > 0 ? io : undefined;
}

// unRAID reports bare kernel device names, the same key Glances uses. A device
// missing from the map means Glances isn't configured, isn't watching this host,
// or has the disk hidden — in every case the row just renders without I/O.
function diskIo(
  rates: ReadonlyMap<string, DiskIoRate>,
  device: string | undefined,
): DiskIoRate | undefined {
  return device ? rates.get(normalizeDeviceName(device)) : undefined;
}

// One array/pool disk: name + device, usage bar when the disk has a
// filesystem (parity disks don't), and status/temp/standby detail. Non-OK
// status is the headline problem signal, so it renders red.
function ArrayDiskRow({
  disk,
  parity = false,
  io,
}: {
  disk: UnraidArrayDisk;
  parity?: boolean;
  io?: DiskIoRate;
}) {
  const hasFs =
    typeof disk.fsSize === "number" && disk.fsSize > 0 && typeof disk.fsUsed === "number";
  const pctUsed = hasFs ? (disk.fsUsed! / disk.fsSize!) * 100 : 0;
  const statusOk = disk.status === "DISK_OK";
  const activity = activeIo(io);
  // Storage polls every 30s and Glances every 5s, so isSpinning lags a spin-up
  // by up to half a minute — live I/O is the fresher proof that it's awake.
  const standby = disk.isSpinning === false && !activity;

  return (
    <View>
      <View className="flex-row items-center justify-between mb-1.5">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <Icon icon={HardDrive} size={14} color="#a1a1aa" />
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {disk.name}
          </Text>
          {parity && (
            <View className="bg-surface-light rounded-full px-2 py-0.5">
              <Text className="text-zinc-400 text-xs">Parity</Text>
            </View>
          )}
          {disk.device ? <Text className="text-zinc-600 text-xs">{disk.device}</Text> : null}
        </View>
        {hasFs ? (
          <Text className={`text-sm font-bold ${usageTextColor(pctUsed)}`}>
            {pctUsed.toFixed(1)}%
          </Text>
        ) : (
          <Text className="text-zinc-500 text-xs">{formatBytes(disk.size)}</Text>
        )}
      </View>

      {hasFs && (
        <ProgressBar
          progress={pctUsed / 100}
          color={usageBarColor(pctUsed)}
          className="mb-1.5"
        />
      )}

      <View className="flex-row items-center gap-3 flex-wrap">
        {!statusOk && disk.status ? (
          <Text className="text-red-400 text-xs">{disk.status.replace(/_/g, " ")}</Text>
        ) : null}
        {hasFs && (
          <>
            <Text className="text-zinc-500 text-xs">Used {formatBytes(disk.fsUsed!)}</Text>
            {typeof disk.fsFree === "number" && (
              <Text className="text-zinc-500 text-xs">Free {formatBytes(disk.fsFree)}</Text>
            )}
            <Text className="text-zinc-500 text-xs">Total {formatBytes(disk.fsSize!)}</Text>
          </>
        )}
        {disk.fsType ? <Text className="text-zinc-600 text-xs">{disk.fsType}</Text> : null}
        {typeof disk.temp === "number" && (
          <Text className="text-zinc-500 text-xs">{disk.temp}°C</Text>
        )}
        {activity && <DiskIoChips io={activity} />}
        {standby && (
          <View className="flex-row items-center gap-1">
            <Icon icon={Moon} size={12} color="#71717a" />
            <Text className="text-zinc-500 text-xs">standby</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function PoolsCard() {
  const { data: storage, isLoading } = useUnraidStorage();
  const ioRates = useGlancesDiskIoRates();
  const pools = storage?.pools ?? [];

  // Hidden entirely on servers without cache/named pools.
  if (!isLoading && pools.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pools</CardTitle>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : (
        <View className="gap-4">
          {pools.map((pool) => (
            <View key={pool.name} className="gap-4">
              {/* A single unnamed-cache setup doesn't need its own label. */}
              {pools.length > 1 && (
                <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
                  {pool.name}
                </Text>
              )}
              {pool.disks.map((disk) => (
                <ArrayDiskRow
                  key={`${pool.name}-${disk.idx}-${disk.name}`}
                  disk={disk}
                  io={diskIo(ioRates, disk.device)}
                />
              ))}
            </View>
          ))}
        </View>
      )}
    </Card>
  );
}

function UnassignedCard() {
  const { data: storage, isLoading } = useUnraidStorage();
  const ioRates = useGlancesDiskIoRates();
  const expanded = useUnraidUiStore((s) => s.unassignedExpanded);
  const setExpanded = useUnraidUiStore((s) => s.setUnassignedExpanded);
  const disks = storage?.unassigned ?? [];

  if (!isLoading && disks.length === 0) return null;

  return (
    <Card>
      <Pressable
        onPress={() => {
          lightHaptic();
          setExpanded(!expanded);
        }}
        className="flex-row items-center justify-between active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={HardDrive} size={18} color="#a1a1aa" />
          <CardTitle>Unassigned</CardTitle>
        </View>
        <View className="flex-row items-center gap-2">
          {!isLoading && (
            <Text className="text-zinc-500 text-xs">
              {disks.length} {disks.length === 1 ? "device" : "devices"}
            </Text>
          )}
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} color="#71717a" />
        </View>
      </Pressable>

      {isLoading ? (
        <View className="mt-4">
          <SkeletonCardContent rows={2} />
        </View>
      ) : expanded ? (
        <Animated.View entering={FadeIn.duration(150)} className="gap-3 mt-4">
          {disks.map((disk) => (
            <UnassignedDiskRow key={disk.id} disk={disk} io={diskIo(ioRates, disk.device)} />
          ))}
        </Animated.View>
      ) : null}
    </Card>
  );
}

// Physical-only info: unassigned devices have no filesystem knowledge, so no
// usage bar — just identity (name/device/serial), size, temp and SMART state.
function UnassignedDiskRow({ disk, io }: { disk: UnraidPhysicalDisk; io?: DiskIoRate }) {
  const smart = disk.smartStatus?.toUpperCase();
  const smartFailing = !!smart && smart !== "OK" && smart !== "PASSED";
  const activity = activeIo(io);

  return (
    <View>
      <View className="flex-row items-center justify-between mb-0.5">
        <View className="flex-row items-center gap-2 flex-1 mr-2">
          <Icon icon={HardDrive} size={14} color="#a1a1aa" />
          <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
            {disk.name}
          </Text>
          <Text className="text-zinc-600 text-xs">{disk.device}</Text>
        </View>
        <Text className="text-zinc-500 text-xs">{formatBytes(disk.size)}</Text>
      </View>
      <View className="flex-row items-center gap-3 flex-wrap">
        {disk.serialNum ? (
          <Text className="text-zinc-600 text-xs" numberOfLines={1}>
            {disk.serialNum}
          </Text>
        ) : null}
        {typeof disk.temperature === "number" && (
          <Text className="text-zinc-500 text-xs">{disk.temperature}°C</Text>
        )}
        {smart && (
          <Text className={`text-xs ${smartFailing ? "text-red-400" : "text-zinc-500"}`}>
            SMART {disk.smartStatus}
          </Text>
        )}
        {activity && <DiskIoChips io={activity} />}
      </View>
    </View>
  );
}

function ContainersCard() {
  const { data: containers, isLoading } = useUnraidContainers();
  const expanded = useUnraidUiStore((s) => s.containersExpanded);
  const setExpanded = useUnraidUiStore((s) => s.setContainersExpanded);
  const [sheetContainer, setSheetContainer] = useState<UnraidContainerType | null>(null);

  const start = useStartUnraidContainer();
  const stop = useStopUnraidContainer();
  const restart = useRestartUnraidContainer();

  // One shared mutation set for every row: the busy id is whichever container
  // an action is currently in flight for (TanStack v5 exposes `variables`
  // while pending), so only that row disables its buttons.
  const busyId =
    (start.isPending && start.variables) ||
    (stop.isPending && stop.variables) ||
    (restart.isPending && restart.variables) ||
    null;

  // No haptic here — the ActionSheet and the inline buttons each fire their
  // own on press, so adding one would double-buzz the sheet path.
  const runAction = (action: "start" | "stop" | "restart", container: UnraidContainerType) => {
    const mutation = action === "start" ? start : action === "stop" ? stop : restart;
    const done = { start: "started", stop: "stopped", restart: "restarted" }[action];
    mutation.mutate(container.id, {
      onSuccess: () => toast(`${container.name} ${done}`),
      onError: (err) => toastError(`Couldn't ${action} ${container.name}`, err),
    });
  };

  const runningCount = containers?.filter((c) => isContainerRunning(c.state)).length ?? 0;
  const sheetRunning = sheetContainer ? isContainerRunning(sheetContainer.state) : false;

  return (
    <Card>
      <Pressable
        onPress={() => {
          lightHaptic();
          setExpanded(!expanded);
        }}
        className="flex-row items-center justify-between active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <Icon icon={Container} size={18} color="#a1a1aa" />
          <CardTitle>Containers</CardTitle>
        </View>
        <View className="flex-row items-center gap-2">
          {containers && (
            <Text className="text-zinc-500 text-xs">
              {runningCount}/{containers.length} running
            </Text>
          )}
          <Icon icon={expanded ? ChevronUp : ChevronDown} size={18} color="#71717a" />
        </View>
      </Pressable>

      {isLoading ? (
        <View className="mt-4">
          <SkeletonCardContent rows={3} />
        </View>
      ) : !containers || containers.length === 0 ? (
        <View className="mt-4">
          <EmptyState
            icon={<Icon icon={Container} size={32} color="#71717a" />}
            title="No containers"
          />
        </View>
      ) : expanded ? (
        <Animated.View entering={FadeIn.duration(150)} className="gap-3 mt-4">
          {/* Running first, then by name — keeps the active set at the top. */}
          {[...containers]
            .sort((a, b) => {
              const ra = isContainerRunning(a.state) ? 0 : 1;
              const rb = isContainerRunning(b.state) ? 0 : 1;
              return ra - rb || a.name.localeCompare(b.name);
            })
            .map((c) => (
              <ContainerRow
                key={c.id}
                container={c}
                busy={busyId === c.id}
                onAction={runAction}
                onOpenSheet={() => setSheetContainer(c)}
              />
            ))}
        </Animated.View>
      ) : null}

      <ActionSheet
        visible={sheetContainer !== null}
        onClose={() => setSheetContainer(null)}
        title={sheetContainer?.name}
        subtitle={sheetContainer?.image}
        actions={[
          {
            label: "Start",
            icon: <Icon icon={Play} size={18} color="#3b82f6" />,
            disabled: sheetRunning,
            onPress: () => sheetContainer && runAction("start", sheetContainer),
          },
          {
            label: "Restart",
            icon: <Icon icon={RotateCw} size={18} color="#3b82f6" />,
            disabled: !sheetRunning,
            onPress: () => sheetContainer && runAction("restart", sheetContainer),
          },
          {
            label: "Stop",
            icon: <Icon icon={Square} size={18} color="#ef4444" />,
            variant: "danger",
            disabled: !sheetRunning,
            onPress: () => sheetContainer && runAction("stop", sheetContainer),
          },
        ]}
      />
    </Card>
  );
}

function ContainerRow({
  container,
  busy,
  onAction,
  onOpenSheet,
}: {
  container: UnraidContainerType;
  busy: boolean;
  onAction: (action: "start" | "stop" | "restart", container: UnraidContainerType) => void;
  onOpenSheet: () => void;
}) {
  const style = containerStateStyle(container.state);
  const running = isContainerRunning(container.state);

  return (
    <Pressable
      onPress={() => {
        lightHaptic();
        onOpenSheet();
      }}
      className="flex-row items-center gap-3 active:opacity-70"
    >
      <View className={`w-2 h-2 rounded-full ${style.dot}`} />
      <View className="flex-1 mr-2">
        <View className="flex-row items-center gap-2">
          <Text className="text-zinc-200 text-sm font-medium shrink" numberOfLines={1}>
            {container.name}
          </Text>
          {container.isUpdateAvailable && (
            <View className="bg-surface-light rounded-full px-2 py-0.5">
              <Text className="text-primary text-xs">Update</Text>
            </View>
          )}
        </View>
        <View className="flex-row items-center gap-2">
          <Text className={`text-xs ${style.text}`}>{container.status || container.state}</Text>
          {container.image ? (
            <Text className="text-zinc-600 text-xs flex-1" numberOfLines={1}>
              {container.image}
            </Text>
          ) : null}
        </View>
      </View>

      <View className="flex-row gap-1">
        {running ? (
          <>
            <Pressable
              onPress={() => {
                lightHaptic();
                onAction("restart", container);
              }}
              disabled={busy}
              className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              <Icon icon={RotateCw} size={16} color="#3b82f6" />
            </Pressable>
            <Pressable
              onPress={() => {
                lightHaptic();
                onAction("stop", container);
              }}
              disabled={busy}
              className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
              hitSlop={6}
            >
              <Icon icon={Square} size={16} color="#ef4444" />
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={() => {
              lightHaptic();
              onAction("start", container);
            }}
            disabled={busy}
            className={`p-1.5 active:opacity-70 ${busy ? "opacity-50" : ""}`}
            hitSlop={6}
          >
            <Icon icon={Play} size={16} color="#3b82f6" />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
}
