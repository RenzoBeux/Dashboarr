/**
 * Service clients that keep a per-instance session in memory (a cookie, a
 * token, a session id) register a reset here. The config store calls it when
 * a restore replaces or reuses an instance id, without importing the clients,
 * which import the store.
 */
type SessionReset = (instanceId: string) => void;

const resets = new Set<SessionReset>();

export function registerSessionReset(reset: SessionReset): void {
  resets.add(reset);
}

export function resetInstanceSessions(instanceIds: Iterable<string>): void {
  for (const id of instanceIds) {
    for (const reset of resets) reset(id);
  }
}
