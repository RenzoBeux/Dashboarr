import {
  listEnabledServiceInstances,
  type StoredServiceInstance,
} from "../db/repos/service-instance.js";
import type { ServiceId } from "../types.js";
import { pollQbittorrent } from "./pollers/qbittorrent.js";
import { pollSabnzbd } from "./pollers/sabnzbd.js";
import { pollRadarr } from "./pollers/radarr.js";
import { pollSonarr } from "./pollers/sonarr.js";
import { pollOverseerr } from "./pollers/overseerr.js";
import { pollProwlarr } from "./pollers/prowlarr.js";
import { pollGlances } from "./pollers/glances.js";
import { pollServiceHealth } from "./pollers/service-health.js";

type PollerFn = (instance: StoredServiceInstance) => Promise<void>;

interface PollerDef {
  kind: ServiceId;
  defaultIntervalMs: number;
  run: PollerFn;
}

const POLLERS: PollerDef[] = [
  { kind: "qbittorrent", defaultIntervalMs: 15_000, run: pollQbittorrent },
  // SAB only needs to poll history fast enough to feel snappy on completion.
  // 30s matches Radarr/Sonarr's queue cadence and is well under the typical
  // post-processing time of any meaningful NZB.
  { kind: "sabnzbd", defaultIntervalMs: 30_000, run: pollSabnzbd },
  { kind: "radarr", defaultIntervalMs: 30_000, run: pollRadarr },
  { kind: "sonarr", defaultIntervalMs: 30_000, run: pollSonarr },
  { kind: "overseerr", defaultIntervalMs: 60_000, run: pollOverseerr },
  { kind: "prowlarr", defaultIntervalMs: 300_000, run: pollProwlarr },
  { kind: "glances", defaultIntervalMs: 30_000, run: pollGlances },
];

const POLLER_BY_KIND = new Map<ServiceId, PollerDef>(POLLERS.map((p) => [p.kind, p]));

const HEALTH_INTERVAL_MS = 30_000;

interface ActivePoller {
  instanceId: string;
  kind: ServiceId;
  name: string;
  intervalMs: number;
  lastRunAt: number | null;
  lastError: string | null;
  handle: NodeJS.Timeout;
  /** Guards against setInterval stacking concurrent runs when a tick takes longer than intervalMs. */
  running: boolean;
}

class Scheduler {
  private active = new Map<string /* instanceId */, ActivePoller>();
  private healthHandle: NodeJS.Timeout | null = null;

  start(): void {
    this.reload();
  }

  stop(): void {
    for (const poller of this.active.values()) {
      clearInterval(poller.handle);
    }
    this.active.clear();
    if (this.healthHandle) {
      clearInterval(this.healthHandle);
      this.healthHandle = null;
    }
  }

  reload(): void {
    this.stop();

    const instances = listEnabledServiceInstances();

    for (const inst of instances) {
      const def = POLLER_BY_KIND.get(inst.serviceId);
      if (!def) continue;
      const intervalMs = inst.pollMs && inst.pollMs > 0 ? inst.pollMs : def.defaultIntervalMs;
      this.spawn(def, inst, intervalMs);
    }

    // Single shared health-poller covers every enabled instance. Splitting it
    // per-instance would multiply timer overhead without benefit — pingService
    // is already cheap and Promise.all parallelizes the actual fetches.
    if (instances.length > 0) {
      this.spawnHealth(instances);
    }
  }

  private spawn(def: PollerDef, instance: StoredServiceInstance, intervalMs: number): void {
    const run = async () => {
      const poller = this.active.get(instance.id);
      if (!poller) return;
      // Skip this tick if the previous run is still in flight — a slow
      // upstream (Radarr taking 40s with a 30s interval) would otherwise stack
      // concurrent fetches and eventually starve the event loop.
      if (poller.running) return;
      poller.running = true;
      poller.lastRunAt = Date.now();
      try {
        await def.run(instance);
        poller.lastError = null;
      } catch (err) {
        poller.lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[poller:${def.kind}:${instance.id}] ${poller.lastError}`);
      } finally {
        poller.running = false;
      }
    };

    const handle = setInterval(run, intervalMs);
    this.active.set(instance.id, {
      instanceId: instance.id,
      kind: def.kind,
      name: instance.name,
      intervalMs,
      lastRunAt: null,
      lastError: null,
      handle,
      running: false,
    });
    // Kick off an immediate run so startup state lands quickly.
    void run();
  }

  private spawnHealth(targets: StoredServiceInstance[]): void {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await pollServiceHealth(targets);
      } catch (err) {
        console.warn(`[poller:health] ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        running = false;
      }
    };
    this.healthHandle = setInterval(run, HEALTH_INTERVAL_MS);
    void run();
  }

  status(): {
    id: string;
    kind: ServiceId;
    name: string;
    intervalMs: number;
    lastRunAt: number | null;
    lastError: string | null;
  }[] {
    return Array.from(this.active.values()).map((p) => ({
      id: p.instanceId,
      kind: p.kind,
      name: p.name,
      intervalMs: p.intervalMs,
      lastRunAt: p.lastRunAt,
      lastError: p.lastError,
    }));
  }
}

let instance: Scheduler | null = null;

export function getScheduler(): Scheduler | null {
  return instance;
}

export function initScheduler(): Scheduler {
  if (!instance) {
    instance = new Scheduler();
    instance.start();
  }
  return instance;
}
