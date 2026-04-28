# Backend Proxy Mode

## Summary
Add an **optional** mode where the Dashboarr app talks only to the self-hosted backend, and the backend proxies all requests to the underlying services (qBittorrent, Radarr, Sonarr, Overseerr, Tautulli, Prowlarr, Plex, Bazarr, Glances). Today, the app connects directly to each service, which means the user has to expose every service individually (port forwards, reverse proxy entries, TLS certs, auth). Proxy mode collapses that to a single exposed endpoint: the backend.

This is **opt-in**, not a replacement. The current direct-connection architecture remains the default so the backend stays optional for users who don't want or need it.

## Motivation
- **One exposed endpoint** instead of N. Easier reverse proxy / Cloudflare Tunnel / Tailscale Funnel setup.
- **One TLS cert** to manage instead of per-service.
- **API keys never leave the server.** The app authenticates to the backend; the backend holds and injects the per-service credentials.
- **Simpler remote access.** Right now WAN access requires exposing each service or running a VPN/tunnel. Proxy mode means one tunnel/port forward and you're done.
- **Centralized policy.** Rate limiting, request logging, IP allowlists, abuse protection — all in one place.

## Tradeoffs
- The backend becomes a **single point of failure** when proxy mode is on. If the backend is down, nothing works.
- **Extra hop of latency** on every request.
- **More backend code to maintain.** Minimum viable version is generic passthrough; richer versions need per-service awareness.
- **Backend now holds all API keys.** Higher-value target if compromised — needs proper secret storage.
- Conflicts with the current "backend is optional" stance in `CLAUDE.md` — needs to be presented clearly as opt-in to preserve that.

## Proposed Design

### Mode toggle
- New per-config flag, e.g. `proxyMode: 'direct' | 'backend'` (default `direct`).
- When `backend`, every service's `baseUrl` is ignored client-side; the app sends requests to `${backendUrl}/proxy/${serviceId}/...` instead.
- Per-service override allowed — some services in direct mode, some in proxy mode (e.g. Plex direct on LAN, Radarr proxied for WAN).

### Generic passthrough (MVP)
Backend exposes a single proxy route:

```
ANY /proxy/:serviceId/*path
```

For each request:
1. Look up `serviceId` in backend config (URL + API key + auth scheme).
2. Inject the appropriate auth header / query param (`X-Api-Key`, `apikey=`, basic auth, etc. — depends on service).
3. Forward method, headers (minus client auth), body, query string.
4. Stream the response back, including status code and content-type.
5. Strip/rewrite headers that leak internal info (e.g. `Server`, internal redirects).

This requires **zero per-service knowledge** — every existing service module in the app keeps working unchanged, just with a different base URL.

### Auth between app and backend
- Reuse the existing backend pairing flow (QR code / token) from the push notification relay.
- Every proxied request carries a bearer token issued during pairing.
- Backend rejects unauthenticated requests.

### Backend config
Backend already has a config file for push notifications. Extend it with a `services` map:

```yaml
services:
  radarr:
    url: http://192.168.1.10:7878
    auth: { type: header, name: X-Api-Key, value: ${RADARR_API_KEY} }
  qbittorrent:
    url: http://192.168.1.10:8080
    auth: { type: cookie, login: ${QBIT_USER}/${QBIT_PASS} }
  ...
```

Secrets via env vars, not committed.

### Edge cases / things to think through
- **WebSockets / streaming** (Plex, qBittorrent live updates): generic passthrough must support upgrade requests.
- **Large downloads** (Plex artwork, posters): proxy must stream, not buffer.
- **qBittorrent cookie auth**: backend has to maintain a session cookie per service, refresh on expiry.
- **Plex token vs API key**: Plex uses `X-Plex-Token` and signs with a client identity. Proxy must preserve or inject the right token without leaking it back to the app.
- **CORS / mixed content**: not an issue for the native app, but worth noting if web target is ever revisited.
- **WiFi-based local/remote URL switching** (already in app): becomes simpler — only one URL to switch.

## Rollout
1. Ship MVP generic passthrough behind a feature flag in the backend.
2. Add `proxyMode` to config schema (bump `CURRENT_CONFIG_VERSION`, add migration per `CLAUDE.md` rules).
3. Add UI in app settings: per-service toggle "Connect via backend".
4. Document in README: who should use this mode, security model, how to set up secrets.
5. Iterate on per-service quirks (qBit cookies, Plex token, websockets) as users hit them.

## Out of Scope (for now)
- Replacing direct mode entirely.
- Multi-user backend with separate creds per user.
- Caching / response transformation in the proxy.
