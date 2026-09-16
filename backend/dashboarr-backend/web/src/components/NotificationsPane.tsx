import type { ExportPayload, NotificationSettings } from "@/lib/config-types";
import { CATEGORY_LABELS, NOTIF_CATEGORIES } from "@/lib/notification-categories";

interface Props {
  settings: NotificationSettings;
  onToggle: (key: Exclude<keyof NotificationSettings, "perInstance" | "apprise" | "qbtMutedCategories">, value: boolean) => void;
  onApprise: (patch: Partial<NonNullable<ExportPayload["notificationSettings"]>["apprise"]>) => void;
}

export function NotificationsPane({ settings, onToggle, onApprise }: Props) {
  const apprise = settings.apprise ?? { enabled: false, url: "", tags: "" };
  return (
    <div className="pane">
      <h2>Notifications</h2>
      <p className="muted small">
        The push categories the backend sends. Per-instance overrides and qBittorrent muted categories are kept as they
        are and edited on the phone.
      </p>
      <label className="field toggle">
        <input type="checkbox" checked={settings.enabled} onChange={(e) => onToggle("enabled", e.target.checked)} />
        <span>Enable notifications</span>
      </label>
      <div className="toggle-grid">
        {NOTIF_CATEGORIES.map((c) => (
          <label key={c} className="field toggle">
            <input type="checkbox" checked={settings[c]} disabled={!settings.enabled} onChange={(e) => onToggle(c, e.target.checked)} />
            <span>{CATEGORY_LABELS[c]}</span>
          </label>
        ))}
      </div>
      <h3>Apprise</h3>
      <label className="field toggle">
        <input type="checkbox" checked={apprise.enabled} onChange={(e) => onApprise({ enabled: e.target.checked })} />
        <span>Also send through an Apprise server</span>
      </label>
      <label className="field">
        <span>Apprise notify URL</span>
        <input
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="http://192.168.1.50:8000/notify/dashboarr"
          value={apprise.url}
          onChange={(e) => onApprise({ url: e.target.value })}
        />
      </label>
      <label className="field">
        <span>Tags (optional)</span>
        <input type="text" autoComplete="off" placeholder="phone,important" value={apprise.tags} onChange={(e) => onApprise({ tags: e.target.value })} />
      </label>
    </div>
  );
}
