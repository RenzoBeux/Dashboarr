import type { Overview } from "../../../src/ui/overview-types";
import { formatDuration, relativeTime } from "../lib/format";
import { StatusPill } from "./StatusPill";

interface Props {
  data: Overview | null;
  error: string | null;
  lastUpdatedAt: number | null;
  refreshing: boolean;
  now: number;
  onRefresh: () => void;
  onLogout: () => void;
}

export function Header({ data, error, lastUpdatedAt, refreshing, now, onRefresh, onLogout }: Props) {
  return (
    <header className="topbar">
      <div>
        <h1>Dashboarr backend</h1>
        <div className="meta">
          {data ? (
            <>
              <StatusPill tone="neutral">v{data.version}</StatusPill>
              <StatusPill tone="neutral" title="Process uptime">
                up {formatDuration(data.uptimeMs)}
              </StatusPill>
              {data.encryptionEnabled ? (
                <StatusPill tone="success" title="CONFIG_ENCRYPTION_KEY is set">
                  Secrets encrypted
                </StatusPill>
              ) : (
                <StatusPill tone="warning" title="Set CONFIG_ENCRYPTION_KEY to encrypt service credentials at rest">
                  Secrets in plaintext
                </StatusPill>
              )}
              <StatusPill tone="neutral" title="Which URL the backend polls (BACKEND_USE_REMOTE)">
                polls {data.backendUseRemote ? "remote" : "local"} URLs
              </StatusPill>
              {data.publicUrl ? <span className="muted small">{data.publicUrl}</span> : null}
            </>
          ) : null}
        </div>
      </div>
      <div className="actions">
        {error ? (
          <StatusPill tone="danger" title={`Last refresh failed (${error}); showing the previous snapshot`}>
            stale
          </StatusPill>
        ) : null}
        <span className="muted small">
          {lastUpdatedAt ? `updated ${relativeTime(lastUpdatedAt, now)}` : "loading…"}
        </span>
        <button type="button" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
        <button type="button" className="secondary" onClick={onLogout}>
          Log out
        </button>
      </div>
    </header>
  );
}
