---
name: service-apis
description: Upstream API reference and hard-won gotchas for every service Dashboarr integrates with (qBittorrent, rtorrent, NZBGet, SABnzbd, Radarr, Sonarr, Prowlarr, Seerr/Overseerr, Jackett, Tautulli, Plex, Bazarr, Glances, Jellyfin, JellyStat). Use when implementing, debugging, or extending any service integration in services/ or hooks/, or when verifying an endpoint shape, auth scheme, or field type.
---

# Service API Documentation (sources of truth)

When implementing or debugging a service integration, consult the upstream API docs below — these are the authoritative references. Prefer fetching the relevant doc page over guessing endpoint shapes.

| Service | API doc URL | Notes |
| --- | --- | --- |
| qBittorrent | https://github.com/qbittorrent/qBittorrent/wiki/WebUI-API-(qBittorrent-5.0) | WebUI API v2; cookie-session auth via `/api/v2/auth/login`. We target qBittorrent 5.0+. The 4.1 wiki page exists for older builds but is not our target. |
| rtorrent / ruTorrent | https://github.com/rakshasa/rtorrent/wiki/RPC-Setup-XMLRPC + https://docs.rtorrent.org/ | XML-RPC over the SCGI HTTP mount (conventionally `/RPC2`, works for bare rtorrent and ruTorrent); HTTP Basic auth. We use `d.multicall2` to list, `system.multicall` to batch actions/global stats, `load.start` (empty first target arg!) to add. Request XML is built by string concat; responses parsed with `fast-xml-parser` in `lib/xmlrpc.ts`. Status derived from `d.state`/`d.is_active`/`d.complete`/`d.hashing`/`d.message`; `d.ratio` is per-mille. Delete-with-data needs ruTorrent's erasedata plugin. |
| NZBGet | https://nzbget.com/documentation/api/ | JSON-RPC 2.0 over `POST /jsonrpc`; positional params only. HTTP Basic Auth using ControlUsername/ControlPassword from `nzbget.conf`. 64-bit byte counts split into Lo/Hi pairs — recombine via `combineHiLo()` in `lib/utils.ts`. |
| Radarr | https://radarr.video/docs/api/ | OpenAPI/Swagger; live spec also served by each instance at `/api/v3/openapi.json`. We use the `v3` API. |
| Sonarr | https://sonarr.tv/docs/api/ | OpenAPI/Swagger; live spec also at `/api/v3/openapi.json`. We use the `v3` API. |
| Prowlarr | https://prowlarr.com/docs/api/ | OpenAPI/Swagger; live spec also at `/api/v1/openapi.json`. We use the `v1` API. |
| Seerr (Overseerr) | https://api-docs.overseerr.dev/ | Same API for Jellyseerr forks. Schema validated by `express-openapi-validator` — unknown query params return 500 (see comment in `services/overseerr-api.ts`). |
| Jackett | https://github.com/Jackett/Jackett (no official API docs; controllers in `src/Jackett.Server/Controllers/`) | Auth is an `apikey` QUERY PARAM (not a header) and only the results/Torznab routes validate it — the admin REST API (`/api/v2.0/indexers`, `/server/config`, per-indexer config/test) requires the admin-password cookie and is off limits. Search via JSON `GET /api/v2.0/indexers/all/results?apikey&Query=` (fields are PascalCase); indexer list + ping via Torznab `GET /api/v2.0/indexers/all/results/torznab/api?t=indexers&configured=true` (XML, parsed with `fast-xml-parser` in `services/jackett-api.ts`). No server-side grab — the app hands MagnetUri/Link to a torrent client via the unified torrent adapter. |
| Tautulli | https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference | Single endpoint: `/api/v2?apikey=…&cmd=…`. Not REST-shaped — see `tautulliRequest` in `services/tautulli-api.ts`. |
| Plex | https://plexapi.dev/ (community) + https://www.plexopedia.com/plex-media-server/api/ | Plex has no official public API docs; the community references above are the de facto sources. Auth via `X-Plex-Token`. |
| Bazarr | https://wiki.bazarr.media/ + live Swagger at `<bazarr>/api/swagger` | Each running instance exposes its own Swagger UI; the wiki covers setup, the Swagger UI is the authoritative endpoint reference. |
| Glances | https://glances.readthedocs.io/en/latest/api.html | REST API exposed when Glances runs in webserver mode (`-w`). We use API v4. |
| Jellyfin | https://api.jellyfin.org/ | OpenAPI; live spec also at `/api-docs/openapi.json`. Auth via `MediaBrowser Token="…"` header. |
| JellyStat | https://github.com/CyferShepard/Jellystat (live Swagger at `<host>/swagger`) | Jellyfin stats server (Tautulli-analog). Root-mounted REST (`/stats`, `/api`, `/proxy`); auth via `x-api-token` header. Postgres `bigint` columns (Count/Plays/PlaybackDuration) serialize as strings — coerce. Live sessions via `/proxy/getSessions` pass the raw Jellyfin payload through. See `services/jellystat-api.ts`. |

Notes:
- The `backend/dashboarr-backend/` Node.js service is in-tree and not a third-party API — its surface is whatever we define there.
- Where an instance hosts its own OpenAPI/Swagger (Radarr, Sonarr, Prowlarr, Bazarr, Jellyfin), prefer fetching the live spec from a real instance over the public docs when verifying field types or new endpoints — the live spec matches the running version exactly.
