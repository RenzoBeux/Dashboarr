import { useCallback, useEffect, useState } from "react";
import type { OverviewBackup } from "../../src/ui/overview-types";
import { WEB_SLOT_ID } from "../../src/ui/overview-types";
import { deleteWebBackup, describeApiError, getBackupEnvelope, getSession, logout, putWebBackup } from "./api";
import { BackupsSection } from "./components/BackupsSection";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { EditorPage } from "./components/EditorPage";
import { HttpNotice } from "./components/HttpNotice";
import { PassphraseDialog } from "./components/PassphraseDialog";
import { openBlank, openFromSlot, type EditorApi, type EditorSession } from "./editor/session";
import { DevicesSection } from "./components/DevicesSection";
import { Disabled } from "./components/Disabled";
import { Header } from "./components/Header";
import { InstancesSection } from "./components/InstancesSection";
import { Login } from "./components/Login";
import { WebhooksSection } from "./components/WebhooksSection";
import { useOverview } from "./hooks/useOverview";

type Phase = "loading" | "disabled" | "anonymous" | "authenticated";

/** Re-renders relative timestamps once a second without refetching. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const h = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(h);
  }, []);
  return now;
}

const editorApi: EditorApi = {
  getEnvelope: (id) => getBackupEnvelope(id),
  putWeb: (body) => putWebBackup(body),
};

type UnlockRequest = { kind: "slot"; slot: OverviewBackup } | { kind: "new" };

function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const { data, error, lastUpdatedAt, refreshing, refresh } = useOverview({ onUnauthenticated: onSignedOut });
  const now = useNow();
  const [unlock, setUnlock] = useState<UnlockRequest | null>(null);
  const [unlockBusy, setUnlockBusy] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [session, setSession] = useState<EditorSession | null>(null);
  const [deleteWeb, setDeleteWeb] = useState<OverviewBackup | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleLogout() {
    setSession(null);
    try {
      await logout();
    } finally {
      onSignedOut();
    }
  }

  const webSlotRevision = data?.backups.find((b) => b.deviceId === WEB_SLOT_ID)?.revision ?? null;

  async function handlePassphrase(passphrase: string) {
    if (!unlock) return;
    setUnlockBusy(true);
    setUnlockError(null);
    try {
      const next =
        unlock.kind === "new"
          ? await openBlank(passphrase, webSlotRevision)
          : await openFromSlot(editorApi, unlock.slot, passphrase, webSlotRevision);
      setSession(next);
      setUnlock(null);
    } catch (err) {
      setUnlockError(err instanceof Error ? err.message : describeApiError(err));
    } finally {
      setUnlockBusy(false);
    }
  }

  async function handleDeleteWeb(slot: OverviewBackup) {
    setDeleteWeb(null);
    try {
      await deleteWebBackup(slot.revision);
      void refresh();
    } catch (err) {
      setActionError(describeApiError(err));
    }
  }

  if (session) {
    return (
      <EditorPage
        session={session}
        backups={data?.backups ?? []}
        now={now}
        onClose={() => {
          setSession(null);
          void refresh();
        }}
        onSaved={() => void refresh()}
      />
    );
  }

  return (
    <main className="page">
      <HttpNotice />
      <Header
        data={data}
        error={error}
        lastUpdatedAt={lastUpdatedAt}
        refreshing={refreshing}
        now={now}
        onRefresh={() => void refresh()}
        onLogout={() => void handleLogout()}
      />
      {data ? (
        <>
          <InstancesSection instances={data.instances} now={now} />
          <DevicesSection devices={data.devices} now={now} />
          <BackupsSection
            backups={data.backups}
            now={now}
            onEdit={(slot) => {
              setUnlockError(null);
              setUnlock({ kind: "slot", slot });
            }}
            onNew={() => {
              setUnlockError(null);
              setUnlock({ kind: "new" });
            }}
            onDeleteWeb={(slot) => setDeleteWeb(slot)}
          />
          <WebhooksSection webhooks={data.webhooks} now={now} />
        </>
      ) : error ? (
        <p className="error">Could not load the overview ({error}).</p>
      ) : (
        <p className="muted">Loading…</p>
      )}
      {actionError ? <p className="notice error">{actionError}</p> : null}
      <PassphraseDialog
        open={unlock !== null}
        mode={unlock?.kind === "new" ? "create" : "open"}
        title={unlock?.kind === "new" ? "New configuration" : "Unlock backup"}
        description={
          unlock?.kind === "new"
            ? "Choose the passphrase this configuration will be encrypted with. The backend never sees it."
            : "Enter the passphrase this backup was made with. It is used in your browser only and never sent to the backend."
        }
        busy={unlockBusy}
        error={unlockError}
        onSubmit={(p) => void handlePassphrase(p)}
        onCancel={() => setUnlock(null)}
      />
      <ConfirmDialog
        open={deleteWeb !== null}
        title="Delete the web configuration"
        message="Phones that have not applied it yet will no longer be offered it. Their own backups are untouched."
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          if (deleteWeb) void handleDeleteWeb(deleteWeb);
        }}
        onCancel={() => setDeleteWeb(null)}
      />
    </main>
  );
}

export function App() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [probeError, setProbeError] = useState(false);

  const probe = useCallback(async () => {
    try {
      const s = await getSession();
      setProbeError(false);
      setPhase(!s.enabled ? "disabled" : s.authenticated ? "authenticated" : "anonymous");
    } catch {
      setProbeError(true);
      setPhase("anonymous");
    }
  }, []);

  useEffect(() => {
    void probe();
  }, [probe]);

  if (phase === "loading") return <main className="centered muted">Loading…</main>;
  if (phase === "disabled") return <Disabled />;
  if (phase === "anonymous") {
    return (
      <>
        {probeError ? <p className="banner error">Could not reach the backend. Is it running?</p> : null}
        <Login onSuccess={() => setPhase("authenticated")} />
      </>
    );
  }
  return <Dashboard onSignedOut={() => setPhase("anonymous")} />;
}
