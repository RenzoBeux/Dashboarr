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
- The `/health` JSON response (`expoAuth: "must-be-disabled"`)
- The `/pair` HTML page

---

## How it works

1. You run this container alongside Radarr/Sonarr/qBittorrent/etc.
2. It exposes an HTTP API, a pairing QR page, and webhook ingestion endpoints.
3. You open Dashboarr → Settings → Backend on your phone, scan the pairing
   QR, and the phone exchanges its Expo push token for a durable shared secret.
4. The app pushes its current service config to the backend (URLs, API keys,
   notification toggles). The backend starts polling and/or waiting for
   webhooks.
5. When something happens — a download finishes, a service goes offline, a new
   Overseerr request appears — the backend fires an Expo push that lands on
   your phone whether the app is running or not.

### Trust chain

```
Phone (Dashboarr app)  ──shared-secret bearer──▶  Your backend
Your backend          ──unauthenticated POST──▶  https://exp.host/.../push/send
```

The backend never holds any Expo credentials. It just knows your phone's
`ExponentPushToken[...]` (scoped to the shared Dashboarr `projectId`) and fires
pushes at it through Expo's public endpoint.

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

Or for development with hot-reload:

```sh
npm run dev
```

The server boots on `:4000`, prints a QR in the logs, and creates
`./data/dashboarr.db` next to `package.json`.

### Building the Docker image manually

```sh
cd backend/dashboarr-backend
docker build -t dashboarr-backend .
docker run -d --name dashboarr-backend \
  -p 4000:4000 \
  -v dashboarr-data:/data \
  -e NODE_ENV=production \
  -e PUBLIC_URL=https://dashboarr.yourdomain.com \
  dashboarr-backend
```

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
| `CONFIG_ENCRYPTION_KEY` | (unset) | When set, per-service `apiKey` / `username` / `password` columns are AES-256-GCM encrypted at rest (key = SHA-256 of this value). Unset = plaintext (back-compat for existing deployments). **Losing this value makes previously-encrypted secrets unrecoverable** — services fail to poll and a warning appears in logs |

---

## HTTP API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET`  | `/health` | none | Liveness + poller status + Expo auth canary |
| `GET`  | `/pair` | none | HTML pairing page with QR + webhook URLs |
| `POST` | `/pair/init` | rate-limited | Regenerate the pairing token |
| `POST` | `/pair/claim` | one-time token in body | Exchange token + push token for shared secret |
| `POST` | `/device/register` | bearer | Refresh push token on reinstall |
| `POST` | `/device/unregister` | bearer | Remove this device |
| `PUT`  | `/config` | bearer | Replace config (push-only — no GET by design, avoids exposing API keys), hot-reload pollers |
| `POST` | `/notifications/test` | bearer | Fire a test push to all paired devices |
| `POST` | `/webhooks/radarr` | `X-Dashboarr-Secret` header | Radarr "Custom" webhook ingestion (preferred) |
| `POST` | `/webhooks/radarr/:secret` | path secret | Same, back-compat for services that can't send custom headers |
| `POST` | `/webhooks/sonarr` | header | Sonarr "Custom" webhook |
| `POST` | `/webhooks/sonarr/:secret` | path | Sonarr back-compat |
| `POST` | `/webhooks/overseerr` | header | Overseerr webhook |
| `POST` | `/webhooks/overseerr/:secret` | path | Overseerr back-compat |
| `POST` | `/webhooks/bazarr` | header | Bazarr webhook (logged only) |
| `POST` | `/webhooks/bazarr/:secret` | path | Bazarr back-compat |
| `POST` | `/webhooks/tautulli` | header | Tautulli webhook (logged only) |
| `POST` | `/webhooks/tautulli/:secret` | path | Tautulli back-compat |

Copy-paste-ready webhook URLs (and the `X-Dashboarr-Secret` value) are written
at startup to `${DATA_DIR}/webhook-urls.txt` with mode 0600 — i.e. readable
only by the backend's user. View them with `cat`:

```sh
docker exec dashboarr-backend cat /data/webhook-urls.txt
```

Prefer the header variant when the service supports custom headers (Radarr 4+,
Sonarr 4+, Overseerr) — the secret stays out of reverse-proxy / CDN access
logs. The path variant remains available for services that can't send custom
headers.

Rate limits: `/pair/*` is capped at 5 req/min, `/webhooks/*` at 60 req/min,
everything else at 120 req/min, all per source IP.

---

## Notification event sources

| Service | Webhook? | Polling? | Notes |
|---|---|---|---|
| **qBittorrent** | ❌ | ✅ 15s | "downloading → not downloading" transition; torrent hash dedupe |
| **Radarr** | ✅ (preferred) | ✅ 30s | Webhook for `Download` event; poll diffs the queue |
| **Sonarr** | ✅ (preferred) | ✅ 30s | Same as Radarr |
| **Overseerr** | ✅ (preferred) | ✅ 60s | Webhook for `MEDIA_PENDING`; poll diffs pending requests |
| **Bazarr** | ✅ (logged) | — | Payload is unstructured; no default category yet |
| **Tautulli** | ✅ (logged) | — | User-scripted payloads; no default category yet |
| **Prowlarr** | ❌ | ✅ 5m | Currently advisory — no user-facing category yet |
| **Glances** | ❌ | ✅ 30s | Health-only; threshold alerts TBD |
| **Plex** | ❌ | — | Nothing polled; reserved |

Events are deduped across sources with keys like
`event:qbt:completed:<hash>` and `event:radarr:webhook:<downloadId>` so a
webhook and a poller can't double-fire the same download.

---

## Verifying push delivery

```sh
# 1. Server is up
curl http://localhost:4000/health
# → { "ok": true, "expoAuth": "must-be-disabled", "pollers": [], ... }

# 2. Pair a fake device for smoke-testing (replace token from logs)
curl -X POST http://localhost:4000/pair/claim \
  -H 'Content-Type: application/json' \
  -d '{"token":"<from-logs>","expoPushToken":"ExponentPushToken[test]","platform":"ios"}'
# → { "deviceId": "...", "sharedSecret": "..." }

# 3. Push a config (minimal)
curl -X PUT http://localhost:4000/config \
  -H "Authorization: Bearer <sharedSecret>" \
  -H 'Content-Type: application/json' \
  -d '{"services":[],"notifications":{"enabled":true,"torrentCompleted":true,"radarrDownloaded":true,"sonarrDownloaded":true,"serviceOffline":true,"overseerrNewRequest":true}}'

# 4. Fire a test push (will log DeviceNotRegistered for the fake token)
curl -X POST http://localhost:4000/notifications/test \
  -H "Authorization: Bearer <sharedSecret>"
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

### Caddy snippet

```
dashboarr.example.com {
  reverse_proxy dashboarr-backend:4000
}
```

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
