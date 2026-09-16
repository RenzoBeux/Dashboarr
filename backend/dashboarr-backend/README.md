# dashboarr-backend

Self-hosted companion service for the [Dashboarr](../../README.md) mobile app.
Polls your *arr stack, ingests native webhooks, and sends **real Expo push
notifications** so events land on your phone's lock screen even when the app is
closed or killed.

- **Stack:** Node 20 · TypeScript · Fastify · better-sqlite3 · Zod
- **Distribution:** Docker image, run alongside your existing *arr containers
- **Data:** one SQLite file at `/data/dashboarr.db` — back it up if you care

---

## 🚨 Operator warning — Expo Enhanced Security MUST stay OFF

This backend POSTs to `https://exp.host/--/api/v2/push/send` with **no
authentication header**. That only works while Expo's "Enhanced Security for
Push Notifications" is **disabled** on the shared Dashboarr project — which is
its default.

If Dashboarr's maintainer ever enables Enhanced Security on the Expo project,
**every self-hosted backend worldwide silently stops delivering pushes** with
no remote fix. This is an intentional tradeoff so that end users don't need
their own Expo accounts or access tokens.

The warning is surfaced in:

- This README
- The Dockerfile `LABEL` metadata
- The startup log banner
- The authenticated `/health` JSON response (`expoAuth: "must-be-disabled"`)

---

## How it works

1. You run this container alongside Radarr/Sonarr/qBittorrent/etc.
2. It exposes an HTTP API and webhook ingestion endpoints, and prints a pairing
   QR to its startup log.
3. You open Dashboarr → Settings → Backend on your phone, scan the pairing
   QR, and the phone exchanges its Expo push token for a durable shared secret.
4. The app pushes its current service config to the backend (every configured
   instance per kind — URLs, API keys, notification toggles). The backend
   spawns one poller per enabled instance and starts ingesting webhooks.
5. When something happens — a download finishes, a service goes offline, a new
   Seerr request appears — the backend fires an Expo push that lands on
   your phone whether the app is running or not.

### Config backup and sharing (backend 1.6+)

Optionally the app also keeps a **passphrase-encrypted backup of its entire
configuration** on the backend: turn on *Keep an encrypted backup on the
backend* in the app's Backend screen, choose a passphrase (8+ characters),
and from then on every config change is re-uploaded a few seconds later.

- The blob is the same AES-256-GCM envelope the app's *Export config* file
  uses, encrypted on the phone with a key derived from your passphrase
  (PBKDF2-SHA256, 100k rounds). **The backend never sees the passphrase and
  cannot read the backup.** It stores ciphertext plus a little metadata (size,
  config version, platform, time).
- **One slot per paired device.** A slot survives *Unpair*, *Rotate secret*
  and a reinstall: it shows as *unpaired* until the phone pairs again or
  someone deletes it from the app.
- **Restore and sharing.** When a phone pairs, the app lists the existing
  backups ("iPhone · app 1.19.0 · 2h ago") and offers to restore one. That is
  also how you hand a full config to a second phone or a family member: they
  pair with the same backend, pick your slot, and type the passphrase you gave
  them. Their own pairing is kept (the synced payload carries no backend
  credentials). After a restore the app offers to keep the new phone backed up
  too.
- **What a stolen bearer gains:** an offline guessing target. Any paired
  device can download any slot, so pick a passphrase you would not use for a
  file you post publicly. The backend rate-limits uploads and deletes to
  10/min per IP; the web UI only ever shows metadata.

### Multi-instance support

Each service kind can have multiple instances (e.g. "Radarr Home" and "Radarr
Seedbox"). The backend keys every poller, every state-tracking row, and every
push dedupe key by the per-instance UUID, so two Radarrs grabbing the same
release produce two distinct notifications instead of false-deduping each
other. Push titles get the instance name prefix automatically when a kind has
more than one enabled instance — single-instance setups stay terse.

For incoming webhooks, attribution is opt-in via a `?instance=<uuid>` query
param on the webhook URL — see [Per-instance webhook attribution](#per-instance-webhook-attribution)
below.

### Trust chain

```
Phone (Dashboarr app)  ──shared-secret bearer──▶  Your backend
Your backend          ──unauthenticated POST──▶  https://exp.host/.../push/send
```

The backend never holds any Expo credentials. It just knows your phone's
`ExponentPushToken[...]` (scoped to the shared Dashboarr `projectId`) and fires
pushes at it through Expo's public endpoint. When config backup is on, it also
holds a passphrase-encrypted envelope it cannot open (see above).

---

## Running it

### docker compose (recommended)

```yaml
services:
  dashboarr-backend:
    image: ghcr.io/renzobeux/dashboarr-backend:latest
    container_name: dashboarr-backend
    restart: unless-stopped
    ports:
      - "4000:4000"
    volumes:
      - ./data:/data
    environment:
      - NODE_ENV=production
      - LOG_LEVEL=info
      # Public URL your phone will use to reach the backend.
      # When set the pairing QR encodes both the URL and token so the app
      # can pair in a single scan. When omitted the QR only contains the
      # token and you enter the URL manually in the app.
      # - PUBLIC_URL=https://dashboarr.yourdomain.com
      # Enable if behind a reverse proxy (Caddy, Nginx, Traefik) so
      # rate limiting uses the real client IP from X-Forwarded-For.
      # - TRUST_PROXY=true
      # Poll Expo for push delivery receipts (rarely needed).
      # - PUSH_RECEIPTS=true
      # Consecutive failed health checks (30s each) before "service offline"
      # notification. Default 3 (~1.5 min). Set to 10 for ~5 min tolerance.
      # - OFFLINE_THRESHOLD=10
      # Route service polls via remoteUrl instead of localUrl. The app's own
      # useRemote flag is always ignored server-side. Default false (backend
      # on LAN). Flip to true only if the backend lives off-LAN.
      # - BACKEND_USE_REMOTE=false
    networks:
      - media
networks:
  media:
    external: true
```

Then:

```sh
docker compose up -d
docker logs -f dashboarr-backend   # scan the QR it prints on startup
```

### Node.js (without Docker)

```sh
cd backend/dashboarr-backend
npm install
npm run build
npm start
```

`npm run build` compiles the server and bundles the web UI (Vite), so the
package's `engines` field requires Node `^20.19.0 || >=22.12.0`. The Docker
image builds on Node 22.

Or for development with hot-reload:

```sh
npm run dev
```

The server boots on `:4000`, prints a QR in the logs, and creates
`./data/dashboarr.db` next to `package.json`.

### Web UI (optional): status page and config editor

The backend serves a small status page at `http://<backend>/`. Set
`WEB_UI_PASSWORD` (8+ characters) to enable it:

```yaml
environment:
  - WEB_UI_PASSWORD=change-me-please
```

It shows what the backend already knows, so you can check on the stack without
the phone in hand:

- **Instances** synced from the app: kind, name, local/remote URL (the one the
  pollers use is highlighted), whether an API key / credentials are present,
  poller interval, last run, last error and how long it has been failing, plus
  the online/offline state from the health poller.
- **Paired devices**: platform, app version, pairing and last-seen times, and
  whether Expo has rejected the push token.
- **Recent webhooks**: the last 50 with source, event type and a one-line
  summary (movie/series title, Seerr subject).
- **Config backups**: one row per device slot with platform, app and config
  version, size, times and revision, plus an *unpaired* badge for slots whose
  device is gone and a *web editor* badge for the slot written from the browser.

#### Editing from the browser (backend 1.7+)

Every backup row has an **Edit** button. The page downloads the encrypted
envelope, asks for its passphrase, and decrypts it **in the browser** with the
same code the app uses; the passphrase is never sent anywhere. The editor
covers service instances (add, edit, remove: name, URLs, credentials per
service, certificate bypass, Seerr sign-in mode) and the notification toggles
and Apprise settings. Dashboards, widgets, home networks, Wake-on-LAN and
appearance pass through untouched and stay phone-only.

**Save to backend** re-encrypts with the same passphrase and writes a
dedicated `web` slot; it never overwrites a phone's own slot. The save carries
the slot revision the editor loaded, so two tabs cannot silently overwrite each
other: a stale save gets a 409 and an explicit *Overwrite* choice.

On the phone, the Backend screen (and the Settings rows leading to it) then
shows **Configuration edited on the web** with an **Apply** button. Applying is
the same full restore as any other backup, keeps the phone's pairing, and
records which revision was applied so the prompt clears. Nothing is ever pushed
into a phone silently; last applied wins.

#### Starting from zero

**New configuration** asks for a passphrase and opens the editor on a blank
configuration with the app's own defaults. Save it, pair the phone, and the
post-pairing restore prompt offers it. The whole first-time setup can happen on
a keyboard.

#### What "the backend never sees the passphrase" means

It holds for the untampered bundle this image serves. A compromised backend,
or an attacker on the network when the page is loaded over plain HTTP, can
serve a modified page and capture the passphrase. The editor shows a notice on
non-localhost `http://` origins. Use HTTPS (the Caddy snippet below) for
anything beyond your own LAN. Nothing about the passphrase is stored in the
browser: the derived key lives in the tab's memory until you close the editor.

It is read-only and deliberately never shows API keys, usernames, passwords,
device secrets, push tokens or raw webhook payloads (those carry file paths and,
for Tautulli, viewer IPs). URLs embedded in error messages have any userinfo
and query string stripped.

Auth details: the password is separate from the device bearer on purpose (the
bearer can rewrite the whole config and lives on the phone, which is the thing
you do not have when you open this page). Login sets an `HttpOnly`,
`SameSite=Strict` cookie scoped to the `ui/api` path, valid 24 h and held in
memory, so a restart logs you out. The editor's writes additionally require a
same-origin request (`Sec-Fetch-Site: same-origin`, or a matching `Origin` on
older browsers; behind nginx that fallback needs `TRUST_PROXY=true` and
`X-Forwarded-Host`). The cookie is only marked `Secure` when the request
arrived over HTTPS, which behind a TLS-terminating proxy requires
`TRUST_PROXY=true`. Login is limited to 5 attempts per minute per IP. Without
`WEB_UI_PASSWORD` the page is still served but shows a setup hint and every
`/ui/api/*` call answers `403 {"error":"ui_disabled"}`.

Behind a reverse proxy the page can live at the root or under a path prefix
such as `https://host/dashboarr/`: assets and API calls are resolved relative
to the page, and the cookie follows the same prefix. Two rules apply: the proxy
must strip the prefix before forwarding (Caddy `handle_path`, nginx `location
/dashboarr/ { proxy_pass http://backend:4000/; }`), and the page must be opened
with the trailing slash.

For development run the API and the Vite dev server side by side:

```sh
WEB_UI_PASSWORD=correct-horse-battery npm run dev   # API on :4000
npm run dev:web                                     # UI on :5173, proxies /ui/api
```

### Building the Docker image manually

The image is built from the **repository root**, because the web editor
bundles the app's pure config modules from `lib/` and `store/`:

```sh
git clone https://github.com/RenzoBeux/Dashboarr.git && cd Dashboarr
docker build -f backend/dashboarr-backend/Dockerfile -t dashboarr-backend .
docker run -d --name dashboarr-backend \
  -p 4000:4000 \
  -v dashboarr-data:/data \
  -e NODE_ENV=production \
  -e PUBLIC_URL=https://dashboarr.yourdomain.com \
  dashboarr-backend
```

`backend/dashboarr-backend/docker-compose.yml` already points its `build` at
the repository root.

---

## Environment variables

| Variable        | Default       | Purpose |
|-----------------|---------------|---------|
| `PORT`          | `4000`        | HTTP listen port |
| `HOST`          | `0.0.0.0`     | HTTP listen host |
| `DATA_DIR`      | `./data`      | SQLite directory (mount a volume here in Docker) |
| `LOG_LEVEL`     | `info`        | pino log level (`fatal`…`trace`) |
| `PUBLIC_URL`    | (unset)       | When set, the pairing QR encodes both URL and token for single-scan pairing. When omitted, the QR only contains the token |
| `PUSH_RECEIPTS` | `false`       | Poll Expo push receipts 15 min after each send (extra cost, rarely needed) |
| `TRUST_PROXY`   | `false`       | Honor `X-Forwarded-*` headers; enable when behind a reverse proxy you control |
| `OFFLINE_THRESHOLD` | `3`       | Consecutive failed health checks (30s each) before a "service offline" push is sent. Raise to `10` (~5 min) if your DDNS is slow to update |
| `BACKEND_USE_REMOTE` | `false`  | Route polls via each service's `remoteUrl` instead of `localUrl`. The app's own `useRemote` flag is always ignored server-side; flip this to `true` only if the backend lives off-LAN from your stack |
| `WEB_UI_PASSWORD` | (unset) | Enables the read-only web UI at `/` (paired devices, instances, poller status, recent webhooks). 8+ chars. Unset = the page shows a setup hint and its data API answers 403 |
| `CONFIG_ENCRYPTION_KEY` | (unset) | When set, per-service `apiKey` / `username` / `password` columns are AES-256-GCM encrypted at rest (key = SHA-256 of this value). Unset = plaintext (back-compat for existing deployments). **Losing this value makes previously-encrypted secrets unrecoverable** — services fail to poll and a warning appears in logs |

---

## HTTP API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`  | `/health` | none (liveness) / bearer (full) | Without an `Authorization` header: `{ "ok": true, "name": "dashboarr-backend" }` — safe for a browser, a Docker `HEALTHCHECK` or an uptime monitor. With a valid bearer: adds `version`, `expoAuth`, `pollers[]` and `uptimeMs`. A **malformed or unknown** `Bearer` still returns `401`, so the app can detect a stale secret |
| `POST` | `/pair/claim` | one-time token in body | Exchange token + push token for shared secret. The token is printed to the **startup log only** — there is deliberately no endpoint that mints or regenerates one (see `src/routes/pair.ts`), so restart the container for a fresh one |
| `POST` | `/device/register` | bearer | Refresh push token on reinstall |
| `POST` | `/device/unregister` | bearer | Remove this device |
| `PUT`  | `/config` | bearer | Replace config (push-only — no GET by design, avoids exposing API keys), hot-reload pollers. Accepts the multi-instance shape `{ instances: [{ id, kind, … }], notifications }` and the legacy `{ services: [{ id, … }], notifications }` shape for back-compat. `notifications` may include an optional `apprise: { enabled, url, tags }` block (see Apprise below) |
| `POST` | `/notifications/test` | bearer | Fire a test push to all paired devices (also fans out to Apprise when enabled) |
| `POST` | `/notifications/apprise/test` | bearer | Send a test notification to Apprise only; returns the real success/failure |
| `PUT`  | `/config/backup` | bearer | Store the caller's passphrase-encrypted config envelope in its own per-device slot. Body `{ envelope, configVersion, exportedAt, appVersion? }`; envelope shape is validated, never decrypted. 4 MB limit (`413 payload_too_large`), 10/min |
| `GET`  | `/config/backups` | bearer | Metadata for every slot (`deviceId`, `platform`, `appVersion`, `paired`, `sizeBytes`, `configVersion`, `exportedAt`, `updatedAt`, `mine`). Never the envelope |
| `GET`  | `/config/backups/:deviceId` | bearer | Metadata plus the envelope for one slot (`:deviceId` may be `web`). Any paired device may read any slot — that is the sharing flow; the passphrase is the only secret |
| `DELETE` | `/config/backups/:deviceId` | bearer | Remove a slot (yours or a stale one). 10/min |
| `GET`  | `/` | none | The web UI bundle (public code; the data behind it is gated). Hashed assets under `/assets/` |
| `POST` | `/ui/api/login` | `WEB_UI_PASSWORD` in body | `{ "password": "…" }` → sets the `dashboarr_ui_session` cookie. 5/min per IP. `403 ui_disabled` when the var is unset |
| `GET`  | `/ui/api/session` | none | `{ enabled, authenticated }` — lets the page pick login / setup hint / dashboard |
| `POST` | `/ui/api/logout` | UI cookie | Revokes the session and clears the cookie |
| `GET`  | `/ui/api/overview` | UI cookie | Everything the page renders in one redacted JSON document (`version`, `uptimeMs`, `encryptionEnabled`, `devices[]`, `instances[]`, `webhooks[]`, `backups[]` metadata incl. `revision`). Never credentials, payloads or backup envelopes |
| `GET`  | `/ui/api/backups/:id/envelope` | UI cookie | A slot's metadata plus its encrypted envelope, for the browser to decrypt. `:id` is a device UUID or `web` |
| `PUT`  | `/ui/api/backups/web` | UI cookie + same-origin | Write the web editor's slot. Body `{ envelope, configVersion, exportedAt, expectedRevision }`; `expectedRevision` must equal the stored revision (`null` = must not exist) or the answer is `409 { error: "conflict", current }`. 4 MB, 10/min |
| `DELETE` | `/ui/api/backups/web` | UI cookie + same-origin | Remove the web slot; optional `{ expectedRevision }`. 10/min |
| `POST` | `/webhooks/radarr` | `X-Dashboarr-Secret` header | Radarr "Custom" webhook ingestion (preferred). Optional `?instance=<uuid>` for per-instance attribution |
| `POST` | `/webhooks/radarr/:secret` | path secret | Same, back-compat for services that can't send custom headers |
| `POST` | `/webhooks/sonarr` | header | Sonarr "Custom" webhook. Optional `?instance=<uuid>` |
| `POST` | `/webhooks/sonarr/:secret` | path | Sonarr back-compat |
| `POST` | `/webhooks/overseerr` | header | Seerr webhook. Optional `?instance=<uuid>` |
| `POST` | `/webhooks/overseerr/:secret` | path | Seerr back-compat |
| `POST` | `/webhooks/bazarr` | header | Bazarr webhook (logged only) |
| `POST` | `/webhooks/bazarr/:secret` | path | Bazarr back-compat |
| `POST` | `/webhooks/tautulli` | header | Tautulli webhook (logged only) |
| `POST` | `/webhooks/tautulli/:secret` | path | Tautulli back-compat |
| `POST` | `/webhooks/tracearr/:secret` | path secret | Tracearr "JSON Webhook". Tracearr can't send a custom header, so use the path-secret form. Optional `?instance=<uuid>` — **required** for the per-instance Tracearr toggles to apply |

Copy-paste-ready webhook URLs (and the `X-Dashboarr-Secret` value) are written
at startup to `${DATA_DIR}/webhook-urls.txt` with mode 0600 — i.e. readable
only by the backend's user. View them with `cat`:

```sh
docker exec dashboarr-backend cat /data/webhook-urls.txt
```

Prefer the header variant when the service supports custom headers (Radarr 4+,
Sonarr 4+, Seerr) — the secret stays out of reverse-proxy / CDN access
logs. The path variant remains available for services that can't send custom
headers.

Rate limits: `/pair/*` is capped at 5 req/min, `/webhooks/*` at 60 req/min,
`PUT /config/backup`, `DELETE /config/backups/:id`, `PUT /ui/api/backups/web` and
`DELETE /ui/api/backups/web` at 10 req/min,
everything else at 120 req/min, all per source IP.

Auth is per-route: there is no global hook and no public-path allowlist, so
every route above states its own requirement. The full `/health` body stays
behind the bearer because `pollers[].lastError` embeds your internal service
URLs, and the poller list itself reveals which services you have configured.

---

## Per-instance webhook attribution

By default a webhook URL like `/webhooks/radarr` is **kind-attributed** — when
it fires, the push reads "Radarr: Movie X downloaded" regardless of which
Radarr instance sent it. Single-instance setups need nothing more than that.

If you have multiple instances of the same kind (e.g. "Radarr Home" and
"Radarr Seedbox") and want pushes to say which one fired, append
`?instance=<uuid>` to the webhook URL **in that service's notification
settings**. Each Radarr's webhook config gets its own URL with its own
instance UUID.

```
# Without attribution (kind-only):
https://dashboarr.example.com/webhooks/radarr

# With attribution (instance-tagged push):
https://dashboarr.example.com/webhooks/radarr?instance=8b1f...c4d2
```

Where to find the instance UUID: in the Dashboarr app, open **Settings →
&lt;service&gt; → &lt;instance&gt;**. The "Webhook Attribution" card shows the
instance UUID with a tap-to-copy button. The card only appears when a backend
is paired and the service has a webhook integration (Radarr, Sonarr, Seerr,
Tautulli, Bazarr, Tracearr).

The single shared `X-Dashboarr-Secret` (or `:secret` path segment) keeps
working unchanged — the query param is a pure additive opt-in.

What you get when attribution is on:

- Push title gains the instance name prefix when the kind has &gt;1 enabled
  instance: "Radarr Seedbox: Movie X downloaded".
- Dedupe key is namespaced by instance UUID, so two Radarrs grabbing the same
  release (same upstream `downloadId`) produce two pushes instead of false-
  deduping each other.
- The push payload includes `data.instanceId` for any future deep-linking
  ("tap notification → open this instance").

If the param is absent, malformed, or refers to a deleted/disabled instance,
the backend silently degrades to kind-only attribution rather than rejecting
the event — the upstream services don't retry on 4xx, so dropping a real event
because of a stale URL would be worse than emitting a generic push.

Tautulli and Bazarr webhooks accept the param too but only record events (no
push), so attribution there is a no-op until those categories are added.

Tracearr is the one case where `?instance=<uuid>` is more than cosmetic. Its
notification toggles live **per-instance** (in each Tracearr instance's editor;
there are no global Tracearr toggles), and a per-instance override only applies
when the push carries `data.instanceId`. So without the `?instance=` param a
Tracearr webhook falls back to the built-in defaults (alerts + server status on,
trust-score + stream events off) and the per-instance toggles have no effect.

---

## Notification event sources

| Service | Webhook? | Polling? | Notes |
|---|---|---|---|
| **qBittorrent** | ❌ | ✅ 15s | "downloading → not downloading" transition; torrent hash dedupe |
| **SABnzbd** | ❌ | ✅ 30s | New history entry with `Completed` status; `nzo_id` dedupe; skips `radarr`/`sonarr` categories |
| **NZBGet** | ❌ | ✅ 30s | New history entry with `SUCCESS`/`WARNING` status; `NZBID` dedupe; skips `radarr`/`sonarr` categories |
| **Radarr** | ✅ (preferred) | ✅ 30s | Webhook for `Download` event; poll diffs the queue |
| **Sonarr** | ✅ (preferred) | ✅ 30s | Same as Radarr |
| **Seerr** | ✅ (preferred) | ✅ 60s | Webhook for `MEDIA_PENDING`; poll diffs pending requests |
| **Bazarr** | ✅ (logged) | — | Payload is unstructured; no default category yet |
| **Tautulli** | ✅ (logged) | — | User-scripted payloads; no default category yet |
| **Tracearr** | ✅ | — | "JSON Webhook" agent → per-event categories: violation / new device / trust score / server down / server up (on by default) and stream started / stopped (off by default). Toggles are per-instance only — use `?instance=<uuid>`. Path-secret URL only (Tracearr can't send a custom header) |
| **Prowlarr** | ❌ | ✅ 5m | Currently advisory — no user-facing category yet |
| **Glances** | ❌ | ✅ 30s | Health-only; threshold alerts TBD |
| **Plex** | ❌ | — | Nothing polled; reserved |

Events are deduped per instance using keys that carry the instance UUID — e.g.
`event:qbt:<instanceId>:completed:<hash>` for poller-driven pushes and
`event:radarr:webhook:<instanceId-or-"any">:<downloadId>` for webhook-driven
ones. The instance namespace prevents two enabled instances of the same kind
from collapsing each other's events when they happen to share an upstream id
(e.g. two Radarrs both grabbing the same release via the same qBittorrent
hash).

---

## Apprise delivery (optional second sink)

Every notification can additionally fan out to an [Apprise](https://github.com/caronc/apprise)
API server (the `caronc/apprise` container), so events reach Discord, Telegram,
ntfy, email, Matrix, etc. — not just Expo push. It's **additive**: Expo push
keeps working, and Apprise honors the same global + per-category toggles. It even
fires when no phone is paired.

We use the **persistent config-key model**: configure your service URLs in the
Apprise server's own config UI under a key (e.g. `dashboarr`), then point
Dashboarr at the full notify endpoint. No service secrets are stored in this
backend's DB — only the notify URL + an optional tag filter, sent in
`notifications.apprise`:

```jsonc
"apprise": {
  "enabled": true,
  "url": "http://apprise:8000/notify/dashboarr", // full /notify/{KEY} endpoint
  "tags": ""                                       // optional Apprise tag filter
}
```

The backend POSTs `{ title, body, type: "info", format: "text", tag? }` to that
URL. Apprise returns `200` on success, `204` if no config is saved under the key,
and `424` if delivery failed or no saved URL matched the tag. Configure it from
the app (Settings → Backend → Apprise) and use **Send Apprise test** to verify.

---

## Verifying push delivery

```sh
# 1. Server is up (no auth needed — liveness projection)
curl http://localhost:4000/health
# → { "ok": true, "name": "dashboarr-backend" }

# 2. Pair a fake device for smoke-testing (replace token from logs)
curl -X POST http://localhost:4000/pair/claim \
  -H 'Content-Type: application/json' \
  -d '{"token":"<from-logs>","expoPushToken":"ExponentPushToken[test]","platform":"ios"}'
# → { "deviceId": "...", "sharedSecret": "..." }

# 3. Push a config (minimal — empty instances list is valid)
curl -X PUT http://localhost:4000/config \
  -H "Authorization: Bearer <sharedSecret>" \
  -H 'Content-Type: application/json' \
  -d '{"instances":[],"notifications":{"enabled":true,"torrentCompleted":true,"radarrDownloaded":true,"sonarrDownloaded":true,"serviceOffline":true,"overseerrNewRequest":true}}'

# 4. Fire a test push (will log DeviceNotRegistered for the fake token)
curl -X POST http://localhost:4000/notifications/test \
  -H "Authorization: Bearer <sharedSecret>"

# 5. Full status: poller list, version, uptime (needs the paired bearer)
curl http://localhost:4000/health -H "Authorization: Bearer <sharedSecret>"
# → { "ok": true, "name": "dashboarr-backend", "version": "1.4.0",
#     "expoAuth": "must-be-disabled", "pollers": [], "uptimeMs": 12345 }
```

For real end-to-end testing you need a development build of Dashboarr with the
shared Expo `projectId` configured and an APNs key uploaded to EAS.

---

## TLS / network exposure

This backend does **not** terminate TLS. Options:

- **LAN-only:** just publish port 4000 on your docker host and keep it on your
  home network. The pairing shared secret still prevents casual abuse.
- **Caddy / Traefik / Nginx Proxy Manager:** put a reverse proxy in front of it
  and terminate TLS there. Set `PUBLIC_URL` to the HTTPS URL so the pairing
  QR encodes the full connection info for single-scan setup.
- **Cloudflare Tunnel:** set `PUBLIC_URL` to your `https://` tunnel hostname so
  the QR pairs in a single scan. If you enter the URL by hand in the app instead,
  type the full `https://` URL. A bare hostname or an `http://` URL gets a
  301/302 redirect to `https://` at the Cloudflare edge, and following that
  redirect rewrites the pairing `POST /pair/claim` into a `GET` (request method
  is downgraded on 301/302), so the backend logs `GET /pair/claim` → 404 and
  pairing fails. The app upgrades a public `http://` host to `https://`
  automatically, but setting `PUBLIC_URL` is the clean fix.

### Caddy snippet

```
dashboarr.example.com {
  reverse_proxy dashboarr-backend:4000
}
```

---

## Troubleshooting

### `/health` returns `{"error":"missing_bearer"}`

On **v1.4.0 and newer** an unauthenticated `GET /health` returns
`200 {"ok":true,"name":"dashboarr-backend"}`. If you still get a 401:

- **You are on an older image.** `docker compose pull && docker compose up -d`.
- **You sent an `Authorization: Bearer …` the backend does not recognise.** That
  is a real 401 (`invalid_bearer`): the shared secret was rotated, or the SQLite
  file was replaced. Re-pair from the app.

Either way it was never a reverse-proxy problem — your proxy was forwarding the
request correctly and the backend was answering it. Adding `^/health` to an
Authentik or Authelia Unauthenticated Paths list does not change it.

### The web UI shows a setup hint, or `/` returns `{"error":"not_found"}`

- The setup hint means `WEB_UI_PASSWORD` is unset (or shorter than 8 chars,
  which fails env validation at boot). Set it and restart.
- A JSON 404 on `/` means the bundle is missing: the image always ships it, so
  this only happens on a Node.js install where `npm run build` was not run
  (the startup log says `web UI bundle not found`).
- `429` on login is the 5/min rate limit. Behind a reverse proxy without
  `TRUST_PROXY=true` every visitor shares the proxy's IP and the limit.

### The container is permanently "unhealthy"

A health check written against the old bearer-only `/health` can never pass:
busybox `wget` exits non-zero on any status ≥ 400, so a 401 fails the probe on
every interval forever.

From v1.4.0 the image ships its own `HEALTHCHECK`, so you can delete a
hand-written one. To use a different interval, override it:

```yaml
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:4000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s
```

### Pairing fails with "Network request failed" behind a private CA

Symptom: `https://dashboarr.example.com/health` loads fine in your phone's
browser, but pairing fails instantly in the app and **nothing appears in the
container log**. The TLS handshake is failing before any HTTP request is sent.

Cause: the proxy is serving a certificate from a private or internal CA (Caddy's
default internal issuer, a homelab root CA, an ACME-less Traefik). Your phone's
browser trusts it because you installed the CA profile; app traffic does not use
that trust store the same way, and on Android user-installed CAs are not trusted
by apps at all unless the app opts in.

Mounting the CA into the **backend** container does not help. `NODE_EXTRA_CA_CERTS`
only affects connections the backend makes *outward* (to your services and to
Expo). It has no bearing on the phone's connection *inward*.

Fixes, best first:

1. **Give that hostname a publicly-trusted certificate.** Let's Encrypt via
   DNS-01 works for names that are not internet-reachable.
2. **Pair over plain `http://` on your LAN.** The shared secret still protects
   the API; see [TLS / network exposure](#tls--network-exposure).
3. **Turn on "Allow invalid certificates"** in the app under **Settings →
   Notifications → Backend**. It skips certificate validation for that host
   only. Use it for a server you trust on a network you control.

If pairing reaches the backend but still fails, check the token: it is
single-use and expires in about 10 minutes. Restart the container to print a
fresh one.

---

## Secrets-at-rest encryption

By default, service credentials (API keys, qBittorrent/Glances passwords) are
stored as plaintext columns in SQLite. Set `CONFIG_ENCRYPTION_KEY` to a long
random string (16+ chars) to enable AES-256-GCM encryption at rest:

```yaml
environment:
  - CONFIG_ENCRYPTION_KEY=change-me-to-something-long-and-random
```

The backend derives the AES-256 key by SHA-256 of this value, so any string
length ≥ 16 works — longer is fine. Existing plaintext rows keep working; new
writes encrypt; rows touched after enabling encryption become encrypted.

**Important tradeoff:** if you lose the value, previously-encrypted credentials
cannot be recovered. Services affected will silently fail to poll and the
backend will log a warning when it can't decrypt a row. If this happens, push
a fresh config snapshot from the app — that re-writes the columns with
plaintext (if the var is unset) or fresh ciphertext (if set).
