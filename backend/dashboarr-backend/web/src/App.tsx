import { useCallback, useEffect, useState } from "react";
import { getSession, logout } from "./api";
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

function Dashboard({ onSignedOut }: { onSignedOut: () => void }) {
  const { data, error, lastUpdatedAt, refreshing, refresh } = useOverview({ onUnauthenticated: onSignedOut });
  const now = useNow();

  async function handleLogout() {
    try {
      await logout();
    } finally {
      onSignedOut();
    }
  }

  return (
    <main className="page">
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
          <WebhooksSection webhooks={data.webhooks} now={now} />
        </>
      ) : error ? (
        <p className="error">Could not load the overview ({error}).</p>
      ) : (
        <p className="muted">Loading…</p>
      )}
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
