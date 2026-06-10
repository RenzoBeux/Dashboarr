<p align="center">
  <img src="assets/icon.png" alt="Dashboarr" width="120" height="120" style="border-radius: 20px;" />
</p>

<h1 align="center">Dashboarr</h1>

<p align="center">
  A mobile app to manage your self-hosted media stack from a single interface.
  <br />
  Built with Expo &amp; React Native. Inspired by nzb360.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Expo_SDK-54-blue?logo=expo" alt="Expo SDK 54" />
  <img src="https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react" alt="React Native" />
  <img src="https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript" alt="TypeScript" />
  <a href="https://play.google.com/store/apps/details?id=com.dashboarr.app"><img src="https://img.shields.io/badge/Android-Google_Play-3DDC84?logo=android&logoColor=white" alt="Android — Google Play" /></a>
  <a href="https://apps.apple.com/us/app/dashboarr/id6762170117"><img src="https://img.shields.io/badge/iOS-App_Store-black?logo=apple" alt="iOS — App Store" /></a>
  <a href="https://github.com/RenzoBeux/Dashboarr/releases/latest"><img src="https://img.shields.io/github/v/release/RenzoBeux/Dashboarr?label=APK&logo=github&color=24292e" alt="Direct APK download" /></a>
  <a href="https://ko-fi.com/renzobeux"><img src="https://img.shields.io/badge/Ko--fi-Support-FF5E5B?logo=ko-fi&logoColor=white" alt="Support on Ko-fi" /></a>
</p>

---

## Contributors

Thanks to everyone who has contributed to Dashboarr!

<a href="https://github.com/RenzoBeux/Dashboarr/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=RenzoBeux/Dashboarr" alt="Contributors" />
</a>

## What is Dashboarr?

Dashboarr is a native mobile app (Android & iOS) that connects directly to your self-hosted *arr stack and media services. No backend server required — the app talks to each service's REST API using your API keys.

**Supported services:**

| Service | What you can do |
|---|---|
| **qBittorrent** | View queue, pause/resume/delete torrents, speed stats, transfer progress |
| **rTorrent / ruTorrent** | View queue, pause/resume/delete torrents, global speed stats, transfer progress |
| **SABnzbd** | View Usenet queue & history, pause/resume/delete jobs, add NZB by URL, speed stats |
| **NZBGet** | View Usenet queue & history, pause/resume/delete jobs, add NZB by URL, speed stats |
| **Radarr** | Search & add movies, monitor status, view queue, missing/wanted lists |
| **Sonarr** | Search & add shows, episode monitoring, airing calendar/schedule |
| **Seerr** | Browse & search media, request movies/shows, approve/decline requests |
| **Tautulli** | Active Plex streams, bandwidth stats, playback history |
| **Tracearr** | Live streams with codec/quality details, bandwidth, playback history |
| **Prowlarr** | Indexer status & toggle, search across all indexers, grab releases, stats |
| **Plex** | Now playing, recently added, on deck, library browsing |
| **Jellyfin** | Now playing, recently added, continue watching, library browsing |
| **Emby** | Now playing, recently added, continue watching, library browsing |
| **Bazarr** | Wanted subtitles for movies & episodes, history, on-demand subtitle search |
| **Glances** | Server CPU, RAM, disk, and network stats |

## Features

- **Unified dashboard** — All your services at a glance with customizable, reorderable cards
- **Multi-instance support** — Run two qBittorrents, split 4K and 1080p Radarrs, or any combination — switch in-tab and aggregate on the dashboard
- **Dark mode only** — Designed for OLED screens and late-night browsing
- **Auto network switching** — Detects your home WiFi SSID and switches between local/remote URLs automatically
- **Per-service configuration** — Enable only the services you use; tabs auto-hide for disabled services
- **Secure storage** — API keys stored in the device's secure enclave via `expo-secure-store`
- **Wake-on-LAN** — Wake your server from the app when it's asleep
- **Pull-to-refresh** — On every screen
- **Config import/export** — Back up and restore your entire configuration (with biometric auth)
- **Adjustable UI scale** — 1.0 / 1.15 / 1.3 for accessibility and larger displays
- **No backend required** — Pure client architecture for core functionality; your data stays between your phone and your servers
- **Optional self-hosted backend** — Enable real push notifications by running the companion backend on your server (Node.js or Docker)

## Download

### iOS — App Store

Dashboarr is now available on the Apple App Store: [Dashboarr on the App Store](https://apps.apple.com/us/app/dashboarr/id6762170117)

### Android — Play Store

Dashboarr is now available on the Google Play Store: [Dashboarr on Google Play](https://play.google.com/store/apps/details?id=com.dashboarr.app)

### Android — Direct APK (de-Googled / sideload)

If you're running a de-Googled Android (GrapheneOS, LineageOS, /e/OS, etc.) or just prefer to sideload, the signed APK for every release is attached to the matching tag on the [Releases page](https://github.com/RenzoBeux/Dashboarr/releases/latest).

1. Download `app-release.apk` from the latest release
2. Open it on your device — Android will prompt you to allow installs from your browser/file manager
3. Updates are **manual**: there is no in-app updater for sideloaded installs, so check the Releases page periodically (or watch the repo)

The APK is signed with the same keystore as the Play Store build, so you can install it side-by-side or migrate from Play without losing data — but you cannot mix the two on the same device.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [pnpm](https://pnpm.io/) (v9+)
- [Expo CLI](https://docs.expo.dev/get-started/installation/)
- Android device/emulator or iOS device/simulator

### Installation

```bash
# Clone the repo
git clone https://github.com/renzobeux/dashboarr.git
cd dashboarr

# Install dependencies
pnpm install

# Start the dev server
pnpm start
```

Scan the QR code with [Expo Go](https://expo.dev/go) on your device, or press `a` for Android emulator / `i` for iOS simulator.

### Building for Production

```bash
# Android (EAS Build)
pnpm build:android

# iOS (EAS Build)
pnpm build:ios

# Android local production build — produces both AAB (Play Store) and APK (sideload)
pnpm build:android:prod

# Upload the locally-built APK to the GitHub Release matching package.json version
# (creates the release with auto-generated notes if it doesn't exist yet)
pnpm release:android:apk

# Build + upload in one go
pnpm release:android
```

The `release:*` scripts require the [GitHub CLI](https://cli.github.com/) (`gh`) to be installed and authenticated against the repo. The APK is read from `android/app/build/outputs/apk/release/app-release.apk` and uploaded to the tag `v<version>` from `package.json`.

## Backend (Optional — Push Notifications)

Dashboarr works fully without a backend. If you want **real push notifications** delivered to your phone's lock screen — torrent completed, new episodes grabbed, request approved, service offline — you can self-host the lightweight companion backend.

The backend polls your services and ingests their webhooks, then fires Expo pushes to every paired device. It pairs with your phone via QR code (no accounts) and supports multiple instances per service kind.

For setup, configuration, environment variables, webhook URLs, and per-instance push attribution, see the **[backend README](backend/dashboarr-backend/README.md)**.

## Configuration

All service configuration is done in the **Settings** tab within the app:

1. Enable the services you use
2. Enter each service's **local URL**, **remote URL**, and **API key**
3. Optionally set your **home WiFi SSID** for automatic local/remote URL switching
4. Reorder dashboard cards by entering edit mode on the dashboard

### Using Dashboarr with Tailscale (or any VPN)

Tailscale works great with Dashboarr. The trick is to address each service by its **Tailscale name or IP** (the `100.x.x.x` address, or a MagicDNS name like `radarr.your-tailnet.ts.net`) instead of its plain LAN IP. Tailscale addresses are reachable from anywhere, so Dashboarr never treats them as offline when you leave your home WiFi.

Pick whichever fits you:

- **Simplest (works everywhere):** turn on **Always use Remote URL**, then put your Tailscale address in the **Remote URL** field (leave Local URL empty). One address that works on WiFi and on cellular, with no home-network setup needed.
- **Fast at home, Tailscale away:**
  1. Set **Local URL** to the plain LAN address (e.g. `http://192.168.1.50:7878`)
  2. Set **Remote URL** to the Tailscale address (e.g. `http://100.x.x.x:7878`)
  3. Add your home WiFi under **Settings → Home Networks**, turn on auto-switch, and leave **Always use Remote URL** off

  At home Dashboarr uses the direct LAN URL; away it uses Tailscale.
- **VPN that routes your LAN (WireGuard, OpenVPN, Tailscale subnet router):** if your tunnel makes the plain `192.168.x` addresses reachable from anywhere, you have two options. With **Auto-switch network** off, nothing to configure: Dashboarr always uses the Local URL and, while a VPN is connected, no longer marks private addresses offline. With auto-switch on, also enable **Settings → Treat VPN as home** (the toggle appears once auto-switch is on): while any VPN is connected, Dashboarr behaves as if you were on your home WiFi and uses the local URLs directly. The app can only detect that *a* VPN is up, not which one, so enable this only if your VPN reaches your home network.

> Without a VPN connected, avoid putting a `192.168.x` or `10.x` address in the **Remote URL** slot. Private LAN addresses can't be reached over mobile data, so Dashboarr marks them offline when you're off WiFi (when a VPN is connected it will still try them). If you only reach your server through a Tailscale **subnet router** (so it has no `100.x` address of its own), this VPN handling covers you; alternatively, install Tailscale directly on that server so it gets its own Tailscale address.

## Project Structure

```
app/                  # Expo Router file-based routing
  (tabs)/             # Bottom tab screens (dashboard, movies, tv, etc.)
  movie/              # Movie detail & search screens
  series/             # Series detail & search screens
  torrent/            # Torrent detail screen
  sab/                # SABnzbd job detail screens
  nzb/                # NZBGet job detail screens
backend/
  dashboarr-backend/  # Self-hosted companion server (Fastify + SQLite)
components/
  ui/                 # Reusable UI primitives (cards, buttons, inputs, toggles)
  common/             # Shared layout components (screen wrapper, pull-to-refresh)
  dashboard/          # Dashboard card components
  downloads/          # Unified downloads list (qBittorrent + SABnzbd + NZBGet)
  qbittorrent/        # qBittorrent-specific components
  radarr/             # Radarr-specific components
  sonarr/             # Sonarr-specific components
  overseerr/          # Seerr-specific components (folder name kept for back-compat)
  settings/           # Settings screen components
services/             # Raw API clients for each service
hooks/                # TanStack Query wrappers (caching, polling, mutations)
store/                # Zustand stores + AsyncStorage/SecureStore helpers
lib/                  # Types, utils, constants, HTTP client, Wake-on-LAN
plugins/              # Custom Expo config plugins (Android signing)
```

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 54 (React Native 0.81) |
| Routing | Expo Router v6 |
| Styling | NativeWind v4 (Tailwind CSS) |
| Data fetching | TanStack Query v5 |
| State management | Zustand v5 |
| Secure storage | expo-secure-store |
| Icons | lucide-react-native |
| Language | TypeScript (strict mode) |

## Roadmap

See [TODO.md](TODO.md) for planned features and ideas.

## Contributing

Contributions are welcome! Feel free to open issues and pull requests.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support Development

Dashboarr is free and open source under GPL-3.0. If you find it useful, you can support continued development on Ko-fi:

<a href="https://ko-fi.com/renzobeux"><img src="https://img.shields.io/badge/Ko--fi-Support%20on%20Ko--fi-FF5E5B?logo=ko-fi&logoColor=white&style=for-the-badge" alt="Support on Ko-fi" height="40" /></a>

Every coffee helps cover Apple Developer fees and time spent adding new services!

## License

This project is open source. See the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [nzb360](https://nzb360.com/) — The original inspiration for this project
- The *arr stack community for building incredible self-hosted media tools

## Star History

<a href="https://www.star-history.com/#RenzoBeux/Dashboarr&Date">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=RenzoBeux/Dashboarr&type=Date&theme=dark" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=RenzoBeux/Dashboarr&type=Date" />
   <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=RenzoBeux/Dashboarr&type=Date" />
 </picture>
</a>
