export function Disabled() {
  return (
    <main className="centered">
      <div className="card login">
        <h1>Dashboarr backend</h1>
        <p className="muted">
          The web UI is not enabled. Set <code>WEB_UI_PASSWORD</code> (8+ characters) in the backend environment and restart
          the container to turn on the status page and the config editor.
        </p>
        <pre>{`environment:
  - WEB_UI_PASSWORD=change-me-please`}</pre>
        <p className="muted small">
          The page shows paired devices, configured instances, poller status, recent webhooks and encrypted config
          backups, and lets you edit a backup with its passphrase. It never shows API keys, passwords or raw webhook
          payloads.
        </p>
      </div>
    </main>
  );
}
