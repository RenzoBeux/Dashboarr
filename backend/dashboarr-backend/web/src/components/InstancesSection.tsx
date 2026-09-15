import type { OverviewInstance } from "../../../src/ui/overview-types";
import { formatDateTime, formatInterval, relativeTime, serviceLabel } from "../lib/format";
import { Section } from "./Section";
import { StatusPill, type Tone } from "./StatusPill";

interface Props {
  instances: OverviewInstance[];
  backendUseRemote: boolean;
  now: number;
}

function healthPill(inst: OverviewInstance) {
  if (!inst.enabled) return <StatusPill tone="neutral">Disabled</StatusPill>;
  if (!inst.health) return <StatusPill tone="neutral" title="Not observed by the health poller yet">Unknown</StatusPill>;
  if (inst.health.online) {
    return (
      <StatusPill tone="success" title={`Last checked ${formatDateTime(inst.health.updatedAt)}`}>
        Online
      </StatusPill>
    );
  }
  return (
    <StatusPill tone="danger" title={`${inst.health.failCount} consecutive failed checks, last ${formatDateTime(inst.health.updatedAt)}`}>
      Offline ({inst.health.failCount})
    </StatusPill>
  );
}

function pollerCell(inst: OverviewInstance, now: number) {
  const p = inst.poller;
  if (!p) {
    return (
      <span className="muted" title="No poller for this service kind, the instance is disabled, or it was skipped (Seerr without an API key)">
        —
      </span>
    );
  }
  return (
    <span title={p.lastRunAt ? `Last run ${formatDateTime(p.lastRunAt)}` : "Not run yet"}>
      every {formatInterval(p.intervalMs)} · {relativeTime(p.lastRunAt, now)}
    </span>
  );
}

function errorCell(inst: OverviewInstance, now: number) {
  const p = inst.poller;
  if (!p?.lastError) return <span className="muted">—</span>;
  return (
    <span className="error-text" title={p.lastError}>
      {p.lastError}
      {p.failingSince ? <span className="muted small"> · failing since {relativeTime(p.failingSince, now)}</span> : null}
    </span>
  );
}

function urlCell(inst: OverviewInstance, backendUseRemote: boolean) {
  const rows: { label: string; url: string; active: boolean }[] = [
    { label: "local", url: inst.localUrl, active: !backendUseRemote },
    { label: "remote", url: inst.remoteUrl, active: backendUseRemote },
  ];
  return (
    <div className="stack">
      {rows.map((r) => (
        <span key={r.label} className={r.active ? "url active" : "url muted"} title={r.active ? "Used by the backend pollers" : undefined}>
          <span className="label">{r.label}</span> {r.url || "—"}
        </span>
      ))}
    </div>
  );
}

function credentialsCell(inst: OverviewInstance) {
  const chips: { text: string; tone: Tone }[] = [];
  if (inst.hasApiKey) chips.push({ text: "API key", tone: "primary" });
  if (inst.hasCredentials) chips.push({ text: "user + pass", tone: "primary" });
  if (chips.length === 0) return <span className="muted">none</span>;
  return (
    <span className="chips">
      {chips.map((c) => (
        <StatusPill key={c.text} tone={c.tone}>
          {c.text}
        </StatusPill>
      ))}
    </span>
  );
}

export function InstancesSection({ instances, backendUseRemote, now }: Props) {
  return (
    <Section
      title="Instances"
      count={instances.length}
      hint="Synced from the app. Credentials are shown as present or absent only."
      empty="No instances yet. Pair the app and it will push its configuration here."
      isEmpty={instances.length === 0}
    >
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Service</th>
            <th>Status</th>
            <th>URLs</th>
            <th>Credentials</th>
            <th>Poller</th>
            <th>Last error</th>
          </tr>
        </thead>
        <tbody>
          {instances.map((inst) => (
            <tr key={inst.id} className={inst.enabled ? undefined : "dim"}>
              <td>
                <span title={inst.id}>{inst.name}</span>
              </td>
              <td>{serviceLabel(inst.kind)}</td>
              <td>{healthPill(inst)}</td>
              <td>{urlCell(inst, backendUseRemote)}</td>
              <td>{credentialsCell(inst)}</td>
              <td>{pollerCell(inst, now)}</td>
              <td className="error-cell">{errorCell(inst, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
