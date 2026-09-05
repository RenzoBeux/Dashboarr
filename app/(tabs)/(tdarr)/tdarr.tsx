import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Cpu,
  Server,
  FolderOpen,
  Layers,
  Play,
  Pause,
  XCircle,
  Zap,
  Search,
  RefreshCw,
  Minus,
  Plus,
} from "lucide-react-native";
import { Icon } from "@/components/ui/icon";
import { ScreenWrapper } from "@/components/common/screen-wrapper";
import { ServiceHeader } from "@/components/common/service-header";
import { CachedDataBanner } from "@/components/common/cached-data-banner";
import { WorkspaceServiceGuard } from "@/components/common/workspace-service-guard";
import { ConfirmModal } from "@/components/common/confirm-modal";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { SkeletonCardContent } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/text-input";
import { toast, toastError } from "@/components/ui/toast";
import { StatPill } from "@/components/tdarr/stat-pill";
import {
  useTdarrStatus,
  useTdarrResStats,
  useTdarrStatistics,
  useTdarrNodes,
  useTdarrLibraries,
  useTdarrPauseNode,
  useTdarrCancelWorkerItem,
  useTdarrKillWorker,
  useTdarrScanFiles,
  useTdarrSearchFiles,
  useTdarrAlterWorkerLimit,
} from "@/hooks/use-tdarr";
import { useServiceHealth } from "@/hooks/use-service-health";
import { usePullToRefresh } from "@/components/common/pull-to-refresh";
import { useModalFlow } from "@/hooks/use-modal-flow";
import { lightHaptic } from "@/lib/haptics";
import { fmt, fileBaseName, sumParts } from "@/lib/tdarr-format";
import type { TdarrNode, TdarrWorker, TdarrLibrary, TdarrFileItem } from "@/lib/types";
import type { TdarrWorkerType } from "@/services/tdarr-api";

export default function TdarrScreen() {
  return (
    <WorkspaceServiceGuard kinds={["tdarr"]}>
      <TdarrScreenInner />
    </WorkspaceServiceGuard>
  );
}

function TdarrScreenInner() {
  const { data: healthData } = useServiceHealth();
  const { refreshing, onRefresh } = usePullToRefresh([["tdarr"]]);
  const tdarrHealth = healthData?.find((s) => s.id === "tdarr");

  return (
    <ScreenWrapper refreshing={refreshing} onRefresh={onRefresh}>
      <ServiceHeader name="Tdarr" online={tdarrHealth?.online} serviceId="tdarr" />
      <CachedDataBanner serviceId="tdarr" label="Tdarr" />
      <View className="gap-4">
        <StatusCard />
        <StatisticsCard />
        <NodesCard />
        <LibrariesCard />
        <FilesSearchCard />
      </View>
    </ScreenWrapper>
  );
}

function StatusCard() {
  const { data: status, isLoading: statusLoading } = useTdarrStatus();
  // Only /status gates the skeleton. The resource pills below are already
  // rendered conditionally, so folding /get-res-stats into the gate would pin
  // the card in a skeleton (re-flickering on every 5s poll) whenever that one
  // endpoint is broken, even though /status answered fine.
  const { data: res } = useTdarrResStats();

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Cpu} size={18} color="#a1a1aa" />
          <CardTitle>Server</CardTitle>
        </View>
        {status && (
          <Text
            className={`text-sm font-semibold ${
              status.status === "good" ? "text-success" : "text-amber-400"
            }`}
          >
            {status.status === "good" ? "Healthy" : status.status}
          </Text>
        )}
      </CardHeader>

      {statusLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !status ? (
        <EmptyState title="No data" />
      ) : (
        <View className="flex-row gap-3 flex-wrap">
          <StatPill label="Version" value={status.version} />
          {res && <StatPill label="CPU" value={`${fmt(res.os?.cpuPerc, 1)}%`} />}
          {res && (
            <StatPill
              label="Memory"
              value={`${fmt(res.os?.memUsedGB, 1)}/${fmt(res.os?.memTotalGB, 1)} GB`}
            />
          )}
        </View>
      )}
    </Card>
  );
}

function StatisticsCard() {
  const { data, isLoading } = useTdarrStatistics();
  const stats = data?.[0];

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Layers} size={18} color="#a1a1aa" />
          <CardTitle>Library</CardTitle>
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !stats ? (
        <EmptyState title="No data" />
      ) : (
        <View className="gap-3">
          <View className="flex-row gap-3 flex-wrap">
            <StatPill label="Files" value={fmt(stats.totalFileCount, 0)} />
            <StatPill label="Transcodes" value={fmt(stats.totalTranscodeCount, 0)} />
            <StatPill label="Health Checks" value={fmt(stats.totalHealthCheckCount, 0)} />
          </View>
          <View className="flex-row gap-3 flex-wrap">
            <StatPill label="Tdarr Score" value={`${fmt(stats.tdarrScore, 0)}%`} />
            <StatPill label="Health Score" value={`${fmt(stats.healthCheckScore, 0)}%`} />
            <StatPill label="Space Saved" value={`${fmt(stats.sizeDiff, 1)} GB`} />
          </View>
        </View>
      )}
    </Card>
  );
}

interface PendingCancel {
  nodeId: string;
  workerId: string;
  fileLabel: string;
}
interface PendingKill {
  nodeId: string;
  workerId: string;
  fileLabel: string;
}

function NodesCard() {
  const { data: nodes, isLoading } = useTdarrNodes();
  const pauseNode = useTdarrPauseNode();
  const cancelWorker = useTdarrCancelWorkerItem();
  const killWorker = useTdarrKillWorker();
  // pendingCancel and pendingKill used to be two independent useState values,
  // each backing its own <ConfirmModal>. Nothing stopped both from becoming
  // non-null at once (e.g. a fast double-tap across the adjacent Cancel/Kill
  // icons in WorkerRow), which on iOS means presenting a second modal while
  // the first is still mid-dismiss — the modal-hang bug from issue #83.
  // useModalFlow makes the two steps mutually exclusive by construction.
  const flow = useModalFlow<{
    cancelWorker: PendingCancel;
    killWorker: PendingKill;
  }>();

  const nodeList = nodes ? Object.values(nodes) : [];

  const handleTogglePause = (node: TdarrNode) => {
    lightHaptic();
    pauseNode.mutate(
      { nodeId: node._id, paused: !node.nodePaused },
      {
        onSuccess: () => toast(node.nodePaused ? "Node resumed" : "Node paused", "success"),
        onError: (err) => toastError("Failed to update node", err),
      },
    );
  };

  const confirmCancel = () => {
    const pendingCancel = flow.payload("cancelWorker");
    if (!pendingCancel) return;
    const { nodeId, workerId } = pendingCancel;
    flow.close();
    cancelWorker.mutate(
      { nodeId, workerId, cause: "manual" },
      {
        onSuccess: () => toast("Job cancelled", "success"),
        onError: (err) => toastError("Failed to cancel job", err),
      },
    );
  };

  const confirmKill = () => {
    const pendingKill = flow.payload("killWorker");
    if (!pendingKill) return;
    const { nodeId, workerId } = pendingKill;
    flow.close();
    killWorker.mutate(
      { nodeId, workerId },
      {
        onSuccess: () => toast("Worker killed", "success"),
        onError: (err) => toastError("Failed to kill worker", err),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Server} size={18} color="#a1a1aa" />
          <CardTitle>Nodes</CardTitle>
        </View>
        {nodeList.length > 0 && (
          <Text className="text-zinc-500 text-xs">{nodeList.length}</Text>
        )}
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={3} />
      ) : nodeList.length === 0 ? (
        <EmptyState
          icon={<Icon icon={Server} size={32} color="#71717a" />}
          title="No nodes connected"
        />
      ) : (
        <View className="gap-4">
          {nodeList.map((node) => (
            <NodeRow
              key={node._id}
              node={node}
              onTogglePause={() => handleTogglePause(node)}
              // Scoped to this node's own id — pauseNode is one shared
              // mutation for every row, so a blanket `pauseNode.isPending`
              // would disable every node's button while ANY node's toggle is
              // in flight.
              pauseTogglePending={
                pauseNode.isPending && pauseNode.variables?.nodeId === node._id
              }
              onCancelWorker={(workerId, fileLabel) =>
                flow.open("cancelWorker", { nodeId: node._id, workerId, fileLabel })
              }
              onKillWorker={(workerId, fileLabel) =>
                flow.open("killWorker", { nodeId: node._id, workerId, fileLabel })
              }
            />
          ))}
        </View>
      )}

      <ConfirmModal
        {...flow.bind("cancelWorker")}
        title="Cancel Job"
        message={
          flow.payload("cancelWorker")
            ? `Cancel processing "${flow.payload("cancelWorker")!.fileLabel}"? Progress on this file will be lost.`
            : ""
        }
        icon={XCircle}
        tone="danger"
        confirmLabel="Cancel Job"
        cancelLabel="Keep Running"
        onConfirm={confirmCancel}
      />

      <ConfirmModal
        {...flow.bind("killWorker")}
        title="Kill Worker"
        message={
          flow.payload("killWorker")
            ? `Force-kill the worker processing "${flow.payload("killWorker")!.fileLabel}"? Progress on this file will be lost.`
            : ""
        }
        icon={Zap}
        tone="danger"
        confirmLabel="Kill Worker"
        cancelLabel="Cancel"
        onConfirm={confirmKill}
      />
    </Card>
  );
}

function NodeRow({
  node,
  onTogglePause,
  pauseTogglePending,
  onCancelWorker,
  onKillWorker,
}: {
  node: TdarrNode;
  onTogglePause: () => void;
  pauseTogglePending: boolean;
  onCancelWorker: (workerId: string, fileLabel: string) => void;
  onKillWorker: (workerId: string, fileLabel: string) => void;
}) {
  const workers = Object.entries(node.workers ?? {});
  const q = node.queueLengths;
  const alterLimit = useTdarrAlterWorkerLimit();

  const handleAlter = (workerType: TdarrWorkerType, process: "increase" | "decrease") => {
    lightHaptic();
    alterLimit.mutate(
      { nodeId: node._id, workerType, process },
      { onError: (err) => toastError("Failed to update worker limit", err) },
    );
  };

  return (
    <View className="bg-surface-light rounded-xl p-3">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="text-zinc-200 text-sm font-medium flex-1 mr-2" numberOfLines={1}>
          {node.nodeName}
        </Text>
        <Pressable
          onPress={onTogglePause}
          disabled={pauseTogglePending}
          className="bg-surface rounded-lg px-3 py-1.5 items-center justify-center active:opacity-70"
        >
          {node.nodePaused ? (
            <View className="flex-row items-center gap-1.5">
              <Icon icon={Play} size={14} color="#3b82f6" />
              <Text className="text-blue-400 text-xs font-medium">Resume</Text>
            </View>
          ) : (
            <View className="flex-row items-center gap-1.5">
              <Icon icon={Pause} size={14} color="#f59e0b" />
              <Text className="text-amber-400 text-xs font-medium">Pause</Text>
            </View>
          )}
        </Pressable>
      </View>

      {q && (
        <View className="flex-row gap-3 flex-wrap mb-2">
          <StatPill label="Transcode Q" value={sumParts(q.transcodecpu, q.transcodegpu)} />
          <StatPill label="Health Q" value={sumParts(q.healthcheckcpu, q.healthcheckgpu)} />
        </View>
      )}

      {node.workerLimits && (
        <View className="gap-1.5 mb-2">
          <Text className="text-zinc-500 text-xs font-semibold uppercase tracking-wider">
            Worker Limits
          </Text>
          <View className="flex-row flex-wrap gap-2">
            <WorkerLimitStepper
              label="Transcode CPU"
              value={node.workerLimits.transcodecpu}
              disabled={alterLimit.isPending}
              onIncrease={() => handleAlter("transcodecpu", "increase")}
              onDecrease={() => handleAlter("transcodecpu", "decrease")}
            />
            <WorkerLimitStepper
              label="Transcode GPU"
              value={node.workerLimits.transcodegpu}
              disabled={alterLimit.isPending}
              onIncrease={() => handleAlter("transcodegpu", "increase")}
              onDecrease={() => handleAlter("transcodegpu", "decrease")}
            />
            <WorkerLimitStepper
              label="Health CPU"
              value={node.workerLimits.healthcheckcpu}
              disabled={alterLimit.isPending}
              onIncrease={() => handleAlter("healthcheckcpu", "increase")}
              onDecrease={() => handleAlter("healthcheckcpu", "decrease")}
            />
            <WorkerLimitStepper
              label="Health GPU"
              value={node.workerLimits.healthcheckgpu}
              disabled={alterLimit.isPending}
              onIncrease={() => handleAlter("healthcheckgpu", "increase")}
              onDecrease={() => handleAlter("healthcheckgpu", "decrease")}
            />
          </View>
        </View>
      )}

      {workers.length === 0 ? (
        <Text className="text-zinc-600 text-xs">Idle</Text>
      ) : (
        <View className="gap-2 mt-1">
          {workers.map(([workerId, worker]) => (
            <WorkerRow
              key={workerId}
              worker={worker}
              onCancel={() => onCancelWorker(workerId, fileBaseName(worker.file) ?? workerId)}
              onKill={() => onKillWorker(workerId, fileBaseName(worker.file) ?? workerId)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function WorkerLimitStepper({
  label,
  value,
  disabled,
  onIncrease,
  onDecrease,
}: {
  label: string;
  value: number;
  disabled: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
}) {
  return (
    <View className="bg-surface rounded-lg px-2.5 py-1.5 items-center min-w-20">
      <Text className="text-zinc-500 text-[0.65rem]" numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-row items-center gap-2 mt-0.5">
        <Pressable
          onPress={onDecrease}
          disabled={disabled || value <= 0}
          className="p-0.5 active:opacity-70"
          style={{ opacity: disabled || value <= 0 ? 0.4 : 1 }}
        >
          <Icon icon={Minus} size={14} color="#a1a1aa" />
        </Pressable>
        <Text className="text-zinc-100 text-sm font-semibold w-4 text-center">{value}</Text>
        <Pressable
          onPress={onIncrease}
          disabled={disabled}
          className="p-0.5 active:opacity-70"
          style={{ opacity: disabled ? 0.4 : 1 }}
        >
          <Icon icon={Plus} size={14} color="#a1a1aa" />
        </Pressable>
      </View>
    </View>
  );
}

function WorkerRow({
  worker,
  onCancel,
  onKill,
}: {
  worker: TdarrWorker;
  onCancel: () => void;
  onKill: () => void;
}) {
  const fileName = fileBaseName(worker.file) ?? "Processing…";
  const pct = typeof worker.percentage === "number" ? worker.percentage : null;

  return (
    <View className="flex-row items-center gap-2 bg-surface rounded-lg px-3 py-2">
      <View className="flex-1 mr-2">
        <Text className="text-zinc-300 text-xs" numberOfLines={1}>
          {fileName}
        </Text>
        <Text className="text-zinc-600 text-xs">
          {pct !== null ? `${fmt(pct, 0)}%` : "—"}
          {worker.ETA ? ` · ETA ${worker.ETA}` : ""}
        </Text>
      </View>
      <Pressable onPress={onCancel} className="p-1.5 active:opacity-70">
        <Icon icon={XCircle} size={16} color="#f59e0b" />
      </Pressable>
      <Pressable onPress={onKill} className="p-1.5 active:opacity-70">
        <Icon icon={Zap} size={16} color="#ef4444" />
      </Pressable>
    </View>
  );
}

function LibrariesCard() {
  const { data: libraries, isLoading } = useTdarrLibraries();
  // Shared across every library row — react-query's mutation observer keeps
  // only ONE set of onSuccess/onError/onSettled callbacks, so calling
  // .mutate() again for a different library before the first settles
  // overwrites them, dropping the first call's toast. Deriving "is this row
  // scanning" from the mutation's own `variables` (rather than separate local
  // state) at least keeps the visual indicator honest about which single
  // in-flight call the shared observer is currently tracking.
  const scanFiles = useTdarrScanFiles();
  const [pendingFreshScan, setPendingFreshScan] = useState<TdarrLibrary | null>(null);

  const runScan = (lib: TdarrLibrary, mode: "scanFindNew" | "scanFresh") => {
    lightHaptic();
    scanFiles.mutate(
      { dbID: lib._id, arrayOrPath: lib.folder, mode },
      {
        onSuccess: () =>
          toast(
            mode === "scanFresh"
              ? `Starting fresh scan on ${lib.name}`
              : `Scanning ${lib.name} for new files`,
            "success",
          ),
        onError: (err) => toastError("Failed to start scan", err),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={FolderOpen} size={18} color="#a1a1aa" />
          <CardTitle>Libraries</CardTitle>
        </View>
      </CardHeader>

      {isLoading ? (
        <SkeletonCardContent rows={2} />
      ) : !libraries || libraries.length === 0 ? (
        <EmptyState
          icon={<Icon icon={FolderOpen} size={32} color="#71717a" />}
          title="No libraries"
        />
      ) : (
        <View className="gap-3">
          {libraries.map((lib) => {
            const isScanning = scanFiles.isPending && scanFiles.variables?.dbID === lib._id;
            return (
              <View key={lib._id} className="gap-2">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 mr-2">
                    <Text className="text-zinc-200 text-sm font-medium" numberOfLines={1}>
                      {lib.name}
                    </Text>
                    <Text className="text-zinc-600 text-xs" numberOfLines={1}>
                      {lib.folder}
                    </Text>
                  </View>
                  <View className="flex-row gap-1.5">
                    {lib.processTranscodes && (
                      <View className="bg-blue-500/15 rounded-md px-1.5 py-0.5">
                        <Text className="text-blue-400 text-xs">Transcode</Text>
                      </View>
                    )}
                    {lib.processHealthChecks && (
                      <View className="bg-success/15 rounded-md px-1.5 py-0.5">
                        <Text className="text-success text-xs">Health</Text>
                      </View>
                    )}
                  </View>
                </View>
                <View className="flex-row gap-2">
                  <Pressable
                    onPress={() => runScan(lib, "scanFindNew")}
                    disabled={isScanning}
                    className="flex-row items-center gap-1.5 bg-surface-light rounded-lg px-2.5 py-1.5 active:opacity-70"
                    style={{ opacity: isScanning ? 0.5 : 1 }}
                  >
                    <Icon icon={Search} size={13} color="#a1a1aa" />
                    <Text className="text-zinc-300 text-xs">
                      {isScanning ? "Scanning…" : "Find New"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setPendingFreshScan(lib)}
                    disabled={isScanning}
                    className="flex-row items-center gap-1.5 bg-surface-light rounded-lg px-2.5 py-1.5 active:opacity-70"
                    style={{ opacity: isScanning ? 0.5 : 1 }}
                  >
                    <Icon icon={RefreshCw} size={13} color="#a1a1aa" />
                    <Text className="text-zinc-300 text-xs">Fresh Scan</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      )}

      <ConfirmModal
        visible={pendingFreshScan !== null}
        title="Fresh Scan"
        message={
          pendingFreshScan
            ? `Run a fresh scan on "${pendingFreshScan.name}"? All files will be re-scanned and placed into the transcode and health check queues.`
            : ""
        }
        icon={RefreshCw}
        tone="danger"
        confirmLabel="Scan"
        cancelLabel="Cancel"
        onConfirm={() => {
          if (pendingFreshScan) runScan(pendingFreshScan, "scanFresh");
          setPendingFreshScan(null);
        }}
        onCancel={() => setPendingFreshScan(null)}
      />
    </Card>
  );
}

function FilesSearchCard() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TdarrFileItem[] | null>(null);
  const search = useTdarrSearchFiles();

  const runSearch = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    search.mutate(
      { query: trimmed },
      {
        onSuccess: (data) => setResults(data),
        onError: (err) => toastError("Search failed", err),
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <View className="flex-row items-center gap-2">
          <Icon icon={Search} size={18} color="#a1a1aa" />
          <CardTitle>Search Files</CardTitle>
        </View>
      </CardHeader>

      <View className="gap-3">
        <TextInput
          placeholder="Search by filename…"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={runSearch}
          returnKeyType="search"
        />

        {search.isPending ? (
          <SkeletonCardContent rows={2} />
        ) : results === null ? (
          <EmptyState
            icon={<Icon icon={Search} size={32} color="#71717a" />}
            title="Search across every library"
          />
        ) : results.length === 0 ? (
          <EmptyState title="No files match" />
        ) : (
          <View className="gap-2">
            {results.map((file) => (
              <View key={file._id} className="bg-surface-light rounded-lg px-3 py-2">
                <Text className="text-zinc-200 text-xs font-medium" numberOfLines={1}>
                  {file.fileNameWithoutExtension || fileBaseName(file.file) || file._id}
                </Text>
                <Text className="text-zinc-500 text-xs" numberOfLines={1}>
                  {[
                    file.video_resolution,
                    file.container,
                    file.file_size ? `${fmt(file.file_size / 1024, 2)} GB` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Card>
  );
}
