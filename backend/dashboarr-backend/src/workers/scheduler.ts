import { listServiceConfigs } from "../db/repos/config.js";
import type { StoredServiceConfig } from "../db/repos/config.js";
import type { ServiceId } from "../types.js";
import { pollQbittorrent } from "./pollers/qbittorrent.js";
import { pollRadarr } from "./pollers/radarr.js";
import { pollSonarr } from "./pollers/sonarr.js";
import { pollOverseerr } from "./pollers/overseerr.js";
import { pollProwlarr } from "./pollers/prowlarr.js";
import { pollGlances } from "./pollers/glances.js";
import { pollServiceHealth } from "./pollers/service-health.js";

type PollerFn = (config: StoredServiceConfig) => Promise<void>;

interface PollerDef {
  id: ServiceId;
  defaultIntervalMs: number;
  run: PollerFn;
}

const POLLERS: PollerDef[] = [
  { id: "qbittorrent", defaultIntervalMs: 15_000, run: pollQbittorrent },
  { id: "radarr", defaultIntervalMs: 30_000, run: pollRadarr },
  { id: "sonarr", defaultIntervalMs: 30_000, run: pollSonarr },
  { id: "overseerr", defaultIntervalMs: 60_000, run: pollOverseerr },
  { id: "prowlarr", defaultIntervalMs: 300_000, run: pollProwlarr },
  { id: "glances", defaultIntervalMs: 30_000, run: pollGlances },
];

const HEALTH_INTERVAL_MS = 30_000;

interface ActivePoller {
  id: ServiceId;
  intervalMs: number;
  lastRunAt: number | null;
  lastError: string | null;
  handle: NodeJS.Timeout;
  /** Guards against setInterval stacking concurrent runs when a tick takes longer than intervalMs. */
  running: boolean;
}

class Scheduler {
  private active = new Map<ServiceId, ActivePoller>();
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

    const configs = listServiceConfigs();
    const enabled = new Map(configs.filter((c) => c.enabled).map((c) => [c.id, c]));

    for (const def of POLLERS) {
      const config = enabled.get(def.id);
      if (!config) continue;
      const intervalMs = config.pollMs && config.pollMs > 0 ? config.pollMs : def.defaultIntervalMs;
      this.spawn(def, config, intervalMs);
    }

    // Service-health poller covers every enabled service
    const healthTargets = Array.from(enabled.values());
    if (healthTargets.length > 0) {
      this.spawnHealth(healthTargets);
    }
  }

  private spawn(def: PollerDef, config: StoredServiceConfig, intervalMs: number): void {
    const run = async () => {
      const poller = this.active.get(def.id);
      if (!poller) return;
      // Skip this tick if the previous run is still in flight — a slow
      // upstream (Radarr taking 40s with a 30s interval) would otherwise stack
      // concurrent fetches and eventually starve the event loop.
      if (poller.running) return;
      poller.running = true;
      poller.lastRunAt = Date.now();
      try {
        await def.run(config);
        poller.lastError = null;
      } catch (err) {
        poller.lastError = err instanceof Error ? err.message : String(err);
        console.warn(`[poller:${def.id}] ${poller.lastError}`);
      } finally {
        poller.running = false;
      }
    };

    const handle = setInterval(run, intervalMs);
    this.active.set(def.id, {
      id: def.id,
      intervalMs,
      lastRunAt: null,
      lastError: null,
      handle,
      running: false,
    });
    // Kick off an immediate run so startup state lands quickly.
    void run();
  }

  private spawnHealth(targets: StoredServiceConfig[]): void {
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

  status(): { id: string; intervalMs: number; lastRunAt: number | null; lastError: string | null }[] {
    return Array.from(this.active.values()).map((p) => ({
      id: p.id,
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
