import type { OverviewBackup } from "../../../src/ui/overview-types";
import { formatBytes, formatDateTime, platformLabel, relativeTime } from "../lib/format";
import { Section } from "./Section";
import { StatusPill } from "./StatusPill";

interface Props {
  backups: OverviewBackup[];
  now: number;
}

export function BackupsSection({ backups, now }: Props) {
  return (
    <Section
      title="Config backups"
      count={backups.length}
      hint="Passphrase-encrypted backups uploaded by the app, one per device. The backend cannot read them; restore and delete happen in the app."
      empty="No backup yet. Turn on 'Keep an encrypted backup on the backend' in the app's Backend screen."
      isEmpty={backups.length === 0}
    >
      <table>
        <thead>
          <tr>
            <th>Device</th>
            <th>Platform</th>
            <th>App version</th>
            <th>Config version</th>
            <th>Size</th>
            <th>Exported</th>
            <th>Uploaded</th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.deviceId}>
              <td>
                <span className="chips">
                  <code title={b.deviceId}>{b.deviceId.slice(0, 8)}</code>
                  {b.paired ? null : (
                    <StatusPill tone="warning" title="The device that uploaded this backup is no longer paired. The slot is kept so it can still be restored.">
                      unpaired
                    </StatusPill>
                  )}
                </span>
              </td>
              <td>{platformLabel(b.platform)}</td>
              <td>{b.appVersion ?? <span className="muted">—</span>}</td>
              <td>v{b.configVersion}</td>
              <td>{formatBytes(b.sizeBytes)}</td>
              <td title={formatDateTime(b.exportedAt)}>{relativeTime(b.exportedAt, now)}</td>
              <td title={formatDateTime(b.updatedAt)}>{relativeTime(b.updatedAt, now)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
