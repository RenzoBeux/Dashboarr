import type { OverviewDevice } from "../../../src/ui/overview-types";
import { formatDateTime, platformLabel, relativeTime } from "../lib/format";
import { Section } from "./Section";
import { StatusPill } from "./StatusPill";

interface Props {
  devices: OverviewDevice[];
  now: number;
}

export function DevicesSection({ devices, now }: Props) {
  return (
    <Section
      title="Paired devices"
      count={devices.length}
      hint="Phones that receive push notifications from this backend."
      empty="No device is paired. Scan the pairing QR from the backend log in the app."
      isEmpty={devices.length === 0}
    >
      <table>
        <thead>
          <tr>
            <th>Device</th>
            <th>Platform</th>
            <th>App version</th>
            <th>Paired</th>
            <th>Last seen</th>
            <th>Push</th>
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>
                <code title={d.id}>{d.id.slice(0, 8)}</code>
              </td>
              <td>{platformLabel(d.platform)}</td>
              <td>{d.appVersion ?? <span className="muted">—</span>}</td>
              <td title={formatDateTime(d.createdAt)}>{relativeTime(d.createdAt, now)}</td>
              <td title={formatDateTime(d.lastSeenAt)}>{relativeTime(d.lastSeenAt, now)}</td>
              <td>
                {d.invalid ? (
                  <StatusPill tone="danger" title="Expo rejected the push token. Re-pair the device.">
                    Token invalid
                  </StatusPill>
                ) : (
                  <StatusPill tone="success">OK</StatusPill>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
