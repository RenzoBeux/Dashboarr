import type { OverviewBackup } from "../../../src/ui/overview-types";
import { WEB_SLOT_ID } from "../../../src/ui/overview-types";
import { formatBytes, formatDateTime, platformLabel, relativeTime } from "../lib/format";
import { Section } from "./Section";
import { StatusPill } from "./StatusPill";

interface Props {
  backups: OverviewBackup[];
  now: number;
  onEdit: (slot: OverviewBackup) => void;
  onNew: () => void;
  onDeleteWeb: (slot: OverviewBackup) => void;
}

export function BackupsSection({ backups, now, onEdit, onNew, onDeleteWeb }: Props) {
  return (
    <Section
      title="Config backups"
      count={backups.length}
      hint="Passphrase-encrypted backups, one per device plus the web editor's own slot. The backend cannot read them. Unlock one with its passphrase to edit it here; phones apply web edits explicitly."
      empty="No backup yet. Turn on 'Keep an encrypted backup on the backend' in the app's Backend screen, or start a new configuration here."
      isEmpty={backups.length === 0}
      action={
        <button type="button" onClick={onNew}>
          New configuration
        </button>
      }
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
            <th></th>
          </tr>
        </thead>
        <tbody>
          {backups.map((b) => (
            <tr key={b.deviceId}>
              <td>
                <span className="chips">
                  <code title={b.deviceId}>{b.deviceId === WEB_SLOT_ID ? "web" : b.deviceId.slice(0, 8)}</code>
                  {b.deviceId === WEB_SLOT_ID ? (
                    <StatusPill tone="primary" title="Written by this web editor. Phones apply it from their Backend screen.">
                      web editor
                    </StatusPill>
                  ) : b.paired ? null : (
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
              <td className="row-actions">
                <button type="button" className="secondary" onClick={() => onEdit(b)}>
                  Edit
                </button>
                {b.deviceId === WEB_SLOT_ID ? (
                  <button type="button" className="secondary danger" onClick={() => onDeleteWeb(b)}>
                    Delete
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
