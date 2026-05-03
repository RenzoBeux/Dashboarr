# Dashboarr — Personal Media Manager

## Project Overview
An open-source mobile app (Android & iOS) to manage a self-hosted media stack from a single interface.
Inspired by nzb360. Licensed under GPL-3.0. No monetization, no feedback system — pure functionality.

- **Repository:** public on GitHub (`renzobeux/dashboarr`)
- **Android:** available on Google Play Store (production)
- **iOS:** available on the Apple App Store
- **Backend:** optional self-hosted companion server for push notifications (Docker or Node.js)

## My Active Stack (Priority Order)
1. qBittorrent — torrent client (core)
2. Radarr — movie automation
3. Sonarr — TV automation
4. Overseerr — media requests
5. Tautulli — Plex monitoring & stats
6. Prowlarr — indexer management
7. Plex — media consumption layer
8. Bazarr — subtitle management
9. Glances — system/server monitoring

## Tech Stack
- **Framework:** Expo SDK 54 (React Native 0.81) — managed workflow
- **Routing:** Expo Router v6 (file-based, built on React Navigation)
- **Styling:** NativeWind v4 (Tailwind CSS for React Native)
- **Data Fetching:** TanStack Query v5 (polling, caching, mutations)
- **State:** Zustand v5 (lightweight local state)
- **Storage:** AsyncStorage (config, cached in-memory), expo-secure-store (API keys)
- **Icons:** lucide-react-native
- **Notifications:** expo-notifications + optional backend push relay
- **Language:** TypeScript (strict)
- **Package Manager:** pnpm
- **Build:** EAS Build + local Android signing via custom Expo plugin
- **Architecture:** Primarily client-side — app talks directly to service APIs. Optional self-hosted backend for push notifications relay.

## Architecture Rules
- Each service is its own isolated module/integration
- All service credentials and URLs live in a single config file (never hardcoded)
- Local/remote URL switching per service (WiFi-based auto-detection via expo-location, or manual toggle)
- SSL/TLS and reverse proxy support for all connections
- Every service communicates via its official REST API using API keys
- Optional backend (`backend/dashboarr-backend`) is a standalone Node.js service for push notification relay — not required for core functionality

## UI/UX Rules
- Dark mode only (forced via userInterfaceStyle: "dark")
- Native mobile app (Android + iOS via Expo)
- Bottom tab navigation between services (tabs auto-hide when service disabled)
- Fast — no unnecessary loading states or re-fetches
- Unified dashboard is the home screen
- Pull-to-refresh on all screens
- Haptic feedback on key interactions

## Phase Plan
### Phase 1 — Core ✅
- [x] qBittorrent: queue, pause, resume, delete, speed stats, progress
- [x] Radarr: search, add movie, monitor, queue, missing/wanted
- [x] Sonarr: search, add show, episode monitoring, airing schedule

### Phase 2 — Visibility & Requests ✅
- [x] Overseerr: browse, search, request movie/show, approve/decline, request status
- [x] Tautulli: active streams, bandwidth stats, playback history

### Phase 3 — Power Tools ✅
- [x] Prowlarr: indexer status/toggle, search all indexers, grab releases, indexer stats
- [x] Plex: now playing sessions, recently added, on deck, library browser

### Phase 4 — Extended Integrations & Infrastructure ✅
- [x] Bazarr: missing subtitles management
- [x] Glances: server stats (CPU, RAM, disk, network) on dashboard
- [x] Push notifications: optional backend relay, QR code pairing, per-service notification watchers
- [x] Wake-on-LAN: wake server from app via magic packet (react-native-udp)
- [x] WiFi-based auto URL switching (local vs remote)
- [x] Calendar view (upcoming media)
- [x] Activity view
- [x] Service health monitoring

## File Structure Conventions
- Expo Router file-based routing in `app/` directory
- `services/` — raw API call functions (fetch to service REST APIs)
- `hooks/` — TanStack Query wrappers around services (caching, polling, mutations)
- `components/ui/` — reusable UI primitives
- `components/dashboard/` — dashboard card components
- `components/common/` — shared layout components
- `components/overseerr/` — Overseerr-specific components (posters, media detail)
- `store/` — Zustand stores + AsyncStorage/SecureStore helpers
- `lib/` — types, utils, constants, HTTP client, notifications, haptics, Wake-on-LAN
- `plugins/` — custom Expo config plugins (e.g. Android signing)
- `scripts/` — icon generation scripts
- `backend/dashboarr-backend/` — optional Node.js push notification relay (Docker-based)
- No index files — import directly from source files

## Config Export/Import & Versioned Migrations
- Config backup lives in `store/config-store.ts` (export/import) + `store/config-migrations.ts` (migration chain)
- `CURRENT_CONFIG_VERSION` in `config-migrations.ts` is the source of truth for the schema version
- Export always writes `CURRENT_CONFIG_VERSION`; import detects the version and chains migrations up
- Migration functions live in a `migrations` record keyed by source version: `N: (payload) => ({ ...transformed, version: N+1 })`
- After migration, import merges services over `defaultServices()` so newly added services get defaults instead of `undefined`
- **When changing the export schema** (new field, renamed field, new service, etc.):
  1. Bump `CURRENT_CONFIG_VERSION`
  2. Add a migration entry for the old version
  3. Update `ExportPayload` interface in `config-store.ts`
  4. Update `exportConfig` / `importConfig` to handle the new data
- Version history: v0 (pre-versioning) → v1 (first versioned) → v2 (backend pairing + notification settings)

## GitHub Pages Landing Page
- Served from `docs/` on the `main` branch: https://renzobeux.github.io/Dashboarr/
- `docs/index.html` — landing page (features, supported services, download links)
- `docs/privacy-policy.html` — privacy policy (required for Play Store)
- **Keep `index.html` in sync** when adding/removing services, changing major features, or updating download links
- Self-contained HTML with inline styles — no build step, no dependencies

## What NOT to Build
- No user accounts or authentication beyond service API keys
- No monetization or credit system
- No feedback or support mechanisms
- Single-user per install — no multi-user or shared access features
