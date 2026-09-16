import { useEffect, useMemo, useState } from "react";
import type { ServiceId } from "@/lib/constants";
import { SERVICE_DEFAULTS } from "@/lib/constants";
import type { ExportPayload } from "@/lib/config-types";
import { CATEGORY_ORDER, SERVICE_CATALOG, SERVICE_CATEGORY_LABELS, servicesInCategory } from "@/lib/service-catalog";
import { seerrAuthMode } from "@/lib/seerr-auth";
import type { SeerrAuthMode } from "@/lib/seerr-auth";
import type { OverviewBackup } from "../../../src/ui/overview-types";
import { ConflictError, describeApiError, getBackupEnvelope, putWebBackup } from "../api";
import {
  addInstance,
  editorProblems,
  normalizeForSave,
  removeInstance,
  setApprise,
  setNotification,
  setSeerrAuthMode,
  updateInstance,
  updateSecrets,
  type SeerrLoaded,
} from "../editor/reducer";
import { saveSession, SUPPORTED_CONFIG_VERSION, type EditorApi, type EditorSession } from "../editor/session";
import { relativeTime } from "../lib/format";
import { ConfirmDialog } from "./ConfirmDialog";
import { HttpNotice } from "./HttpNotice";
import { InstanceForm } from "./InstanceForm";
import { NotificationsPane } from "./NotificationsPane";
import { StatusPill } from "./StatusPill";

type Selection = { kind: "service"; id: ServiceId } | { kind: "notifications" };

const liveApi: EditorApi = {
  getEnvelope: (id) => getBackupEnvelope(id),
  putWeb: (body) => putWebBackup(body),
};

interface Props {
  session: EditorSession;
  /** The latest slot list from the overview poll, for the version and conflict advisories. */
  backups: OverviewBackup[];
  now: number;
  onClose: () => void;
  onSaved: (revision: number) => void;
}

export function EditorPage({ session, backups, now, onClose, onSaved }: Props) {
  const [payload, setPayload] = useState<ExportPayload>(session.payload);
  const [baseRevision, setBaseRevision] = useState<number | null>(session.baseRevision);
  const [dirty, setDirty] = useState(session.source.kind === "new");
  const [selection, setSelection] = useState<Selection>({ kind: "service", id: "qbittorrent" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [conflict, setConflict] = useState<OverviewBackup | null | undefined>(undefined);
  const [pendingRemove, setPendingRemove] = useState<{ kind: ServiceId; id: string } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // What each Seerr instance's credentials looked like when the editor opened,
  // so switching the mode back restores them (see reducer.setSeerrAuthMode).
  const loadedSeerr = useMemo(() => {
    const map = new Map<string, SeerrLoaded>();
    for (const inst of session.payload.services.overseerr ?? []) {
      const s = session.payload.secrets[inst.id] ?? {};
      map.set(inst.id, { mode: seerrAuthMode(inst), secrets: { apiKey: s.apiKey, username: s.username, password: s.password } });
    }
    return map;
  }, [session]);

  // Dirty-editor reload guard. (Cleanup of the decrypted payload on pagehide
  // is implicit: nothing is persisted, the tab's memory goes with it.)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  function edit(next: ExportPayload) {
    setPayload(next);
    setDirty(true);
    setSaveError(null);
  }

  const problems = editorProblems(payload);
  const webSlot = backups.find((b) => b.deviceId === "web");
  const phoneSlots = backups.filter((b) => b.deviceId !== "web");
  const newerPhone = phoneSlots.filter((b) => session.source.kind === "slot" && b.updatedAt > session.source.slot.updatedAt);
  const webMovedSinceOpen = webSlot !== undefined && webSlot.revision !== (baseRevision ?? -1) && baseRevision !== null
    ? webSlot.revision !== baseRevision
    : webSlot !== undefined && baseRevision === null;

  async function save(expectedRevision: number | null) {
    setSaving(true);
    setSaveError(null);
    try {
      const result = await saveSession(liveApi, session, normalizeForSave(payload), expectedRevision);
      setBaseRevision(result.revision);
      setDirty(false);
      setLastSavedAt(result.updatedAt);
      setConflict(undefined);
      onSaved(result.revision);
    } catch (err) {
      if (err instanceof ConflictError) {
        setConflict(err.current);
      } else {
        setSaveError(describeApiError(err));
      }
    } finally {
      setSaving(false);
    }
  }

  const sourceLabel =
    session.source.kind === "new"
      ? "New configuration"
      : session.source.slot.deviceId === "web"
        ? "Web editor slot"
        : `${session.source.slot.platform === "ios" ? "iPhone" : session.source.slot.platform === "android" ? "Android" : session.source.slot.platform} · ${session.source.slot.deviceId.slice(0, 8)}`;

  return (
    <main className="page editor">
      <HttpNotice />
      <header className="topbar">
        <div>
          <h1>Configuration editor</h1>
          <div className="meta">
            <StatusPill tone="neutral" title="Where this configuration was loaded from">{sourceLabel}</StatusPill>
            <StatusPill tone="neutral" title="Config schema version this backend's editor writes">
              config v{SUPPORTED_CONFIG_VERSION}
            </StatusPill>
            {phoneSlots.map((b) => (
              <StatusPill key={b.deviceId} tone="neutral" title="A phone's backup and its app version">
                {b.platform} · app {b.appVersion ?? "?"} · config v{b.configVersion}
              </StatusPill>
            ))}
            {dirty ? <StatusPill tone="warning">Unsaved changes</StatusPill> : lastSavedAt ? <StatusPill tone="success">Saved {relativeTime(lastSavedAt, now)}</StatusPill> : null}
          </div>
        </div>
        <div className="actions">
          <button type="button" className="secondary" onClick={() => (dirty ? setConfirmDiscard(true) : onClose())}>
            {dirty ? "Discard and close" : "Close"}
          </button>
          <button type="button" onClick={() => void save(baseRevision)} disabled={saving || problems.length > 0 || !dirty}>
            {saving ? "Saving…" : "Save to backend"}
          </button>
        </div>
      </header>

      {newerPhone.length > 0 ? (
        <p className="notice warning">
          A phone uploaded a newer backup after this one was made. Saving keeps your edits and will not include those
          phone changes.
        </p>
      ) : null}
      {webMovedSinceOpen ? (
        <p className="notice warning">
          The web slot changed on the backend since you opened the editor. Saving will ask before overwriting it.
        </p>
      ) : null}
      {saveError ? <p className="notice error">{saveError}</p> : null}
      {problems.length > 0 ? (
        <div className="notice warning">
          <strong>Fix before saving:</strong>
          <ul>
            {problems.map((p) => (
              <li key={`${p.instanceId}-${p.message}`}>{p.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="editor-layout">
        <nav className="sidebar" aria-label="Sections">
          {CATEGORY_ORDER.map((cat) => (
            <div key={cat} className="sidebar-group">
              <div className="sidebar-title">{SERVICE_CATEGORY_LABELS[cat]}</div>
              {servicesInCategory(cat).map((kind) => {
                const list = payload.services[kind] ?? [];
                const configured = list.filter((i) => i.enabled).length;
                const active = selection.kind === "service" && selection.id === kind;
                return (
                  <button key={kind} type="button" className={`sidebar-item${active ? " active" : ""}`} onClick={() => setSelection({ kind: "service", id: kind })}>
                    <span>{SERVICE_DEFAULTS[kind].name}</span>
                    {configured > 0 ? <span className="count">{configured}</span> : null}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="sidebar-group">
            <div className="sidebar-title">App</div>
            <button type="button" className={`sidebar-item${selection.kind === "notifications" ? " active" : ""}`} onClick={() => setSelection({ kind: "notifications" })}>
              <span>Notifications</span>
            </button>
          </div>
        </nav>

        <section className="card editor-pane">
          {selection.kind === "notifications" ? (
            <NotificationsPane
              settings={payload.notificationSettings ?? session.payload.notificationSettings!}
              onToggle={(key, value) => edit(setNotification(payload, key, value))}
              onApprise={(patch) => edit(setApprise(payload, patch))}
            />
          ) : (
            <ServicePane
              kind={selection.id}
              payload={payload}
              loadedSeerr={loadedSeerr}
              onEdit={edit}
              onRemove={(id) => setPendingRemove({ kind: selection.id, id })}
            />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingRemove !== null}
        title="Remove instance"
        message="The instance, its credentials and its notification overrides are removed from this configuration. Dashboards that attached it will drop it."
        confirmLabel="Remove"
        danger
        onConfirm={() => {
          if (pendingRemove) edit(removeInstance(payload, pendingRemove.kind, pendingRemove.id));
          setPendingRemove(null);
        }}
        onCancel={() => setPendingRemove(null)}
      />
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes"
        message="Your unsaved edits will be lost."
        confirmLabel="Discard"
        danger
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />
      <ConfirmDialog
        open={conflict !== undefined}
        title="The web slot changed"
        message={
          conflict === null
            ? "The web configuration was deleted on the backend while you were editing. Save yours as the new one?"
            : `The web configuration was saved from elsewhere ${relativeTime(conflict?.updatedAt ?? now, now)} (revision ${conflict?.revision}). Overwrite it with your edits?`
        }
        confirmLabel="Overwrite"
        danger
        onConfirm={() => void save(conflict === null || conflict === undefined ? null : conflict.revision)}
        onCancel={() => setConflict(undefined)}
      />
    </main>
  );
}

function ServicePane({
  kind,
  payload,
  loadedSeerr,
  onEdit,
  onRemove,
}: {
  kind: ServiceId;
  payload: ExportPayload;
  loadedSeerr: Map<string, SeerrLoaded>;
  onEdit: (next: ExportPayload) => void;
  onRemove: (id: string) => void;
}) {
  const entry = SERVICE_CATALOG[kind];
  const list = payload.services[kind] ?? [];
  const hasCurated = payload.dashboards.some((d) => Array.isArray(d.attachedInstances));
  return (
    <div className="pane">
      <div className="pane-header">
        <div>
          <h2>{SERVICE_DEFAULTS[kind].name}</h2>
          <p className="muted small">{entry.tagline}</p>
        </div>
        <button type="button" className="secondary" onClick={() => onEdit(addInstance(payload, kind).payload)}>
          Add instance
        </button>
      </div>
      {hasCurated ? (
        <p className="muted small">
          A dashboard on the phone has a curated instance list. New instances are not attached to it until you pick
          them there.
        </p>
      ) : null}
      {list.length === 0 ? <p className="empty">No {SERVICE_DEFAULTS[kind].name} instance. Add one to configure it.</p> : null}
      {list.map((inst, index) => (
        <details key={inst.id} className="instance" open={list.length === 1 || index === 0}>
          <summary>
            <span>{inst.name || SERVICE_DEFAULTS[kind].name}</span>
            <span className="chips">
              {inst.enabled ? <StatusPill tone="success">enabled</StatusPill> : <StatusPill tone="neutral">disabled</StatusPill>}
              {inst.localUrl ? <span className="muted small">{inst.localUrl}</span> : null}
            </span>
          </summary>
          <InstanceForm
            kind={kind}
            instance={inst}
            secrets={payload.secrets[inst.id]}
            onChange={(patch) => onEdit(updateInstance(payload, kind, inst.id, patch))}
            onSecrets={(patch) => onEdit(updateSecrets(payload, inst.id, patch))}
            onSeerrMode={(mode: SeerrAuthMode) => onEdit(setSeerrAuthMode(payload, inst.id, mode, loadedSeerr.get(inst.id)))}
            onRemove={() => onRemove(inst.id)}
          />
        </details>
      ))}
    </div>
  );
}
