# nzb360 Clone — Personal Media Manager

## Project Overview
A personal web/mobile app to manage my self-hosted media stack from a single unified interface.
Inspired by nzb360. No monetization, no feedback system — pure functionality.

## My Active Stack (Priority Order)
1. qBittorrent — torrent client (core)
2. Radarr — movie automation
3. Sonarr — TV automation
4. Overseerr — media requests
5. Tautulli — Plex monitoring & stats
6. Prowlarr — indexer management
7. Plex (pkex) — media consumption layer

## Tech Stack
- **Framework:** Expo SDK 52 (React Native) — managed workflow
- **Routing:** Expo Router v4 (file-based, built on React Navigation)
- **Styling:** NativeWind v4 (Tailwind CSS for React Native)
- **Data Fetching:** TanStack Query v5 (polling, caching, mutations)
- **State:** Zustand v5 (lightweight local state)
- **Storage:** react-native-mmkv (config), expo-secure-store (API keys)
- **Icons:** lucide-react-native
- **Language:** TypeScript (strict)
- **Architecture:** Pure client — no backend, app talks directly to service APIs

## Architecture Rules
- Each service is its own isolated module/integration
- All service credentials and URLs live in a single config file (never hardcoded)
- Local/remote URL switching per service (based on network or manual toggle)
- SSL/TLS and reverse proxy support for all connections
- Every service communicates via its official REST API using API keys

## UI/UX Rules
- Dark mode only (forced via userInterfaceStyle: "dark")
- Native mobile app (Android + iOS via Expo)
- Bottom tab navigation between services (tabs auto-hide when service disabled)
- Fast — no unnecessary loading states or re-fetches
- Unified dashboard is the home screen
- Pull-to-refresh on all screens

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

## File Structure Conventions
- Expo Router file-based routing in `app/` directory
- `services/` — raw API call functions (fetch to service REST APIs)
- `hooks/` — TanStack Query wrappers around services (caching, polling, mutations)
- `components/ui/` — reusable UI primitives
- `components/dashboard/` — dashboard card components
- `components/common/` — shared layout components
- `store/` — Zustand stores + MMKV/SecureStore helpers
- `lib/` — types, utils, constants, HTTP client
- No index files — import directly from source files

## What NOT to Build
- No user accounts or authentication beyond service API keys
- No monetization or credit system
- No feedback or support mechanisms
- No public-facing features — this is single-user only
