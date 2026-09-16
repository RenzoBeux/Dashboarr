import type { OverviewWebhook } from "../../../src/ui/overview-types";
import { formatDateTime, relativeTime, serviceLabel } from "../lib/format";
import { Section } from "./Section";

interface Props {
  webhooks: OverviewWebhook[];
  now: number;
}

export function WebhooksSection({ webhooks, now }: Props) {
  return (
    <Section
      title="Recent webhooks"
      count={webhooks.length}
      hint="Newest first, last 50. Raw payloads are never shown."
      empty="No webhook has arrived yet. Point Radarr, Sonarr, Seerr, Bazarr, Tautulli or Tracearr at this backend."
      isEmpty={webhooks.length === 0}
    >
      <table>
        <thead>
          <tr>
            <th>Received</th>
            <th>Source</th>
            <th>Event</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((w) => (
            <tr key={w.id}>
              <td title={formatDateTime(w.receivedAt)}>{relativeTime(w.receivedAt, now)}</td>
              <td>{serviceLabel(w.source)}</td>
              <td>{w.eventType ? <code>{w.eventType}</code> : <span className="muted">—</span>}</td>
              <td>{w.summary ?? <span className="muted">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}
