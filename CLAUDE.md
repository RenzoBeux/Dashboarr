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
2. SABnzbd — Usenet client
3. Radarr — movie automation
4. Sonarr — TV automation
5. Seerr — media requests (formerly Overseerr; same API, internal id and folders still use `overseerr`)
6. Tautulli — Plex monitoring & stats
7. Prowlarr — indexer management
8. Plex — media consumption layer
9. Bazarr — subtitle management
10. Glances — system/server monitoring

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

## Service API Documentation (sources of truth)
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
| Tautulli | https://github.com/Tautulli/Tautulli/wiki/Tautulli-API-Reference | Single endpoint: `/api/v2?apikey=…&cmd=…`. Not REST-shaped — see `tautulliRequest` in `services/tautulli-api.ts`. |
| Plex | https://plexapi.dev/ (community) + https://www.plexopedia.com/plex-media-server/api/ | Plex has no official public API docs; the community references above are the de facto sources. Auth via `X-Plex-Token`. |
| Bazarr | https://wiki.bazarr.media/ + live Swagger at `<bazarr>/api/swagger` | Each running instance exposes its own Swagger UI; the wiki covers setup, the Swagger UI is the authoritative endpoint reference. |
| Glances | https://glances.readthedocs.io/en/latest/api.html | REST API exposed when Glances runs in webserver mode (`-w`). We use API v4. |
| Jellyfin | https://api.jellyfin.org/ | OpenAPI; live spec also at `/api-docs/openapi.json`. Auth via `MediaBrowser Token="…"` header. |
| JellyStat | https://github.com/CyferShepard/Jellystat (live Swagger at `<host>/swagger`) | Jellyfin stats server (Tautulli-analog). Root-mounted REST (`/stats`, `/api`, `/proxy`); auth via `x-api-token` header. Postgres `bigint` columns (Count/Plays/PlaybackDuration) serialize as strings — coerce. Live sessions via `/proxy/getSessions` pass the raw Jellyfin payload through. See `services/jellystat-api.ts`. |

Notes:
- The `backend/dashboarr-backend/` Node.js service is in-tree and not a third-party API — its surface is whatever we define there.
- Where an instance hosts its own OpenAPI/Swagger (Radarr, Sonarr, Prowlarr, Bazarr, Jellyfin), prefer fetching the live spec from a real instance over the public docs when verifying field types or new endpoints — the live spec matches the running version exactly.

## UI/UX Rules
- Dark mode only (forced via userInterfaceStyle: "dark")
- Native mobile app (Android + iOS via Expo)
- Bottom tab navigation between services (tabs auto-hide when service disabled)
- Fast — no unnecessary loading states or re-fetches
- Unified dashboard is the home screen
- Pull-to-refresh on all screens
- Haptic feedback on key interactions

## Confirmations & Dialogs — MUST follow

- **Never use React Native's native `Alert.alert` (or any OS-native dialog) for confirmations.** It looks out of place against the app's dark, styled UI. Always use the styled **`ConfirmModal`** from `components/common/confirm-modal.tsx` — state-driven (`visible` + `onConfirm` / `onCancel`), with `tone="danger"` for destructive actions and an optional `icon`. Reference: the "Search Missing" confirm in `app/(tabs)/tv.tsx` and the delete confirms in `app/series/[id].tsx` / `app/movie/[id].tsx`.
- `ConfirmModal` is a two-button (cancel + confirm) dialog. For **3+ choices** (e.g. "Delete" vs "Delete + Files"), use the styled **`ActionSheet`** (`components/ui/action-sheet.tsx`) instead — never a multi-button native `Alert`.
- For transient success/error feedback, use the **`toast`** / **`toastError`** helpers from `components/ui/toast.tsx`, not `Alert`.

### Modal sequencing on iOS — MUST follow (causes a frozen-app, force-quit hang)

`ConfirmModal` and `ActionSheet` are React Native `<Modal>`s — on iOS each is a separate `UIViewController` presented over the screen. iOS will **not** present (or unmount the screen behind) a second view controller while another is mid-dismiss. On the New Architecture (Fabric, which this app uses) doing so **hangs the JS thread**: a transparent layer keeps eating touches, there is no crash log, and the user must force-quit. It is **intermittent and iOS-only** — a race between how fast your async work resolves and the ~300ms dismiss animation — so a fast LAN service triggers it while a slower one hides it, and Android never reproduces it. This was issue #83 (deleting a Radarr movie).

**Every modal chain goes through `useModalFlow` (`hooks/use-modal-flow.ts`).** Any flow where a modal leads to another modal (sheet → confirm, sheet → sheet) or to navigation (confirm → pop, sheet action → push) declares its modals as named flow steps; the flow owns visibility, the payload handoff between steps, and deferred navigation. Never hand-wire the sequencing (intent `useRef`s, `Platform.OS` branches, manual `onClosed` promotion) and never paper over it with `setTimeout(() => router.back(), 250)`-style fixed delays — that's the guess that keeps failing.

- Open/close steps only through the flow: `flow.open(step, payload?)` (safe even from inside a sheet action's `onPress` — the flow waits for the dismissal), `flow.close()`, `{...flow.bind(step)}` spread onto the `ConfirmModal`/`ActionSheet`.
- Navigation after a modal goes through `flow.back()` (or `flow.whenClear(fn)` for `router.push` / `navigation.dispatch` / OS pickers) — from a mutation's `onSuccess` for confirm-then-pop, or right after `mutate()` for optimistic pops.
- Only `onClosed`-capable modals (`ConfirmModal`, `ActionSheet`, `ReleaseDetailSheet`, `PassphrasePrompt`, `AddToDashboardsSheet` — anything wiring `useModalClosed` to an `onClosed` prop) can be flow steps. Custom sheets without that plumbing (pageSheet `Modal`s, pickers) keep plain `useState` and must never chain into another modal or navigation. A promise-based prompt (passphrase, HTTP warning) resolves its promise inside `flow.whenClear(...)` so the caller resumes only after full dismissal.
- The sequencing rules live in `lib/modal-flow.ts` (pure, tested in `lib/modal-flow.test.ts`); `onClosed` delivery is `hooks/use-modal-closed.ts` (iOS `onDismiss` fast-path + timer backstop).

Canonical reference: `app/movie/[id].tsx` (actions sheet → delete confirm → pop; root-folder sheet → move-files sheet). When adding any chained modal flow, copy that wiring.

## UI Scale (Accessibility) — MUST follow when writing any new UI

The app exposes a global UI scale preference (1.0 / 1.15 / 1.3) wired via NativeWind v4's reactive `rem` observable. `app/_layout.tsx` calls `rem.set(14 * uiScale)` whenever the setting changes, which scales every rem-based style across the running app with no remount. **Every new UI element must scale with this setting.** The rules:

- **`inlineRem: false` in `metro.config.js` is load-bearing.** With NativeWind's default `inlineRem: 14`, every `rem` value (`text-sm` = 0.875rem, `p-4` = 1rem, etc.) is statically multiplied by 14 at bundle time and becomes a frozen pixel value — `rem.set()` would do nothing. Setting `inlineRem: false` keeps rem as a runtime descriptor so styles re-resolve when the observable updates. Do not change this setting without first verifying every rem-based class still scales.

- **Use standard Tailwind classes for sizing.** `text-sm`, `text-xs`, `text-base`, `text-lg`, `p-4`, `gap-3`, `mb-2`, `w-14`, `h-20`, `rounded-xl`, etc. all compile to rem and scale automatically.
- **Never use literal-pixel arbitrary values.** No `text-[10px]`, `w-[80px]`, `h-[120px]`, `min-w-[170px]`. If you need a non-standard size, use rem arbitrary values: `text-[0.7rem]`, `w-[5.7rem]`, `min-w-[12rem]`.
- **Never use inline `style={{ fontSize: N }}` / `style={{ width: N, height: N }}` with raw numbers.** Move to className with rem values, or — when the prop must stay numeric — multiply by `useUiScale()` from `hooks/use-ui-scale.ts` inside the component (see `MediaPosterTile`, `MediaBackdropRow`).
- **Always wrap lucide icons with `<Icon icon={Foo} size={N} />`** from `components/ui/icon.tsx`. Raw `<Foo size={20} />` will not scale.
- **Indirect lucide icons need wrapping too.** `const StateIcon = isPaused ? Pause : Play; <StateIcon size={14} />` is a bug — it must be `<Icon icon={StateIcon} size={14} />`. Same for `<FallbackIcon>`, `<ServiceIcon>`, `<MediaIcon>`, etc. Search `const \w*Icon\s*=` to audit.
- **Don't shadow the `Icon` import.** If a local variable holds a lucide component, name it `XxxIcon` (e.g. `WidgetIcon`, `ToastIcon`), never `Icon`.
- **Maps of lucide components** (e.g. `SERVICE_ICONS`, `ICON_MAP`) — type them as `Record<K, React.ComponentType<any>>`, not `Record<K, React.ElementType>` (which permits `string` and breaks the `<Icon>` wrapper's prop type).
- **Wrap-grids that should drop columns at higher scale** (poster grids in movies/tv/plex/jellyfin/seerr) — use `usePosterCellWidth()` from `hooks/use-poster-cell.ts` and apply via inline `style={{ width: cellWidth }}`, NOT className percentages like `w-[30%]`. It returns a numeric pixel width: 3 cols at scale 1.0 and 2 cols at scale ≥ 1.15. With rem-scaled gaps and intrinsic text widths, RN/Yoga's flex-wrap with percentage children is unreliable and can collapse layouts to 1 column. Numeric pixel widths via `useWindowDimensions` + `useUiScale` are deterministic at every scale. Don't hardcode `w-[8rem]` or similar — that just shrinks/grows in place without reflowing.
- **Wrap-grids of intrinsically-sized content** (chip/tag clouds) — no width set; items wrap naturally. Already correct.
- **Wrap-grids whose items carry user-typed text** (the Status widget's service tiles, `components/dashboard/service-health-card.tsx`) — must get a computed cell width too, via `useServiceTileLayout()` from `hooks/use-service-tile-cell.ts`. Left intrinsic, a long instance name stretches its tile and knocks every following tile out of its column, and the label's `numberOfLines` never truncates because nothing bounds it. Give the label `w-full` (under `items-center` it would otherwise shrink-wrap) and allow **two** lines: a cell is only ~72px at scale 1.0, and one line collapses "qBittorrent Home" and "qBittorrent Cabin" to the same `qBittorrent …`, which is exactly the distinction the instance name is there to make. That hook's inset accounts for one extra level of nesting vs `usePosterCellWidth` (ScreenWrapper `px-4` + Card `p-4` + the dashed slot border edit mode adds), and it derives the column count from the available width instead of hardcoding 3-or-2. Take the grid's `gap` from the same hook (inline `style={{ gap }}`) so the rendered gap and the column math can't drift.
- **Horizontal-scroll rows** (e.g. dashboard rows, search results carousels) — fixed rem widths are correct. They get bigger via rem; they don't need to reflow column count.
- **`Skeleton` placeholder widths/heights** — pass percentages (`width="100%"`) when possible. Numeric props go to inline style and won't scale; this is acceptable for brief loading shimmers but never for visible content.
- **Tab bar in `app/(tabs)/_layout.tsx` is deliberately excluded** — React Navigation owns its `tabBarIcon` sizing. Don't wrap or scale those icons.
- **When a numeric size is unavoidable on a third-party component** (Skeleton, lucide icons inside a shared primitive that takes a numeric `size` prop) — read `useUiScale()` and multiply at the call site. See `MediaPosterTile.scaledWidth`, `MediaBackdropRow.posterW`, `PosterSkeletonRow.w`.
- **Hierarchy at higher scales:** when an item gets visually much bigger (e.g. a poster card grows from 30% to 47% width), bump its primary title one Tailwind tier (`text-xs` → `text-sm`, or `text-sm` → `text-base`) so the type stays anchored to the bigger frame. Keep secondary metadata one tier smaller for clear hierarchy.
- **Horizontal rows of `FilterChip` (or any chip-like row) MUST be inside a horizontal `ScrollView`,** not a plain `<View className="flex-row">`. At higher uiScale chips grow with rem and easily overflow off-screen with no way to access the cut-off ones. Standard pattern:
  ```tsx
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerClassName="gap-2"
    className="mb-4"
  >
    {chips}
  </ScrollView>
  ```
  Same applies to any horizontal list of items whose count or label length isn't tightly bounded — at higher scales they'll exceed the viewport and clip.

## Keyboard Avoidance — MUST follow for any UI with text inputs

If a screen has a `TextInput` (raw `react-native` or `@/components/ui/text-input`), the keyboard must never obscure it. `KeyboardProvider` from `react-native-keyboard-controller` is mounted at the root in `app/_layout.tsx`, so all the hooks/components below work anywhere in the tree, including inside `Modal`. **Pick the pattern by container shape — do not write your own `Keyboard.addListener` repositioning code.**

- **Full-screen route (uses `ScreenWrapper`)** — already handled. `components/common/screen-wrapper.tsx` uses `KeyboardAwareScrollView` from `react-native-keyboard-controller`. Just place inputs inside `<ScreenWrapper>` and they'll lift on focus. Reference: any settings screen.
- **Custom animated bottom sheet (reanimated `translateY` + `Modal`)** — use `useReanimatedKeyboardAnimation` from `react-native-keyboard-controller` and add `keyboard.height.value` to the sheet's existing `translateY`. `height` is `0` when hidden and `-keyboardHeight` when shown, so the addition naturally lifts the whole sheet above the keyboard while preserving drag-to-dismiss and open/close springs. Reference: `components/dashboard/dashboard-picker-sheet.tsx`.
- **Native page-sheet `Modal` with a `ScrollView`** (`presentationStyle="pageSheet"` or `animationType="slide"` full-screen) — replace the inner `ScrollView` with `KeyboardAwareScrollView` from `react-native-keyboard-controller`. Pass `keyboardShouldPersistTaps="handled"`, `keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}`, `bottomOffset={20}`, and run `cssInterop(KeyboardAwareScrollView, { className: "style", contentContainerClassName: "contentContainerStyle" })` once at module top so Tailwind classes work. Reference: `components/qbittorrent/speed-limits-sheet.tsx`.
- **Centered card/dialog `Modal`** (alert-style, transparent background, content centered) — wrap the card in `KeyboardAvoidingView` from `react-native` with `behavior={Platform.OS === "ios" ? "padding" : undefined}`. Reference: `components/common/confirm-modal.tsx`. **Only safe for short cards** — `KeyboardAvoidingView` just shrinks the centering area, so a tall card (multiple text inputs + toggle + buttons) clips behind the keyboard on iOS. For tall, input-heavy centered modals, use `KeyboardAwareScrollView` from `react-native-keyboard-controller` as the modal's root (`className="flex-1 bg-black/70"`, `contentContainerClassName="flex-grow items-center justify-center px-6 py-6"`, `keyboardShouldPersistTaps="handled"`, `bottomOffset={20}`, plus the `cssInterop` setup) and put the card inside it — content stays centered when it fits and becomes scrollable when the keyboard squeezes the area. Reference: `components/common/passphrase-prompt.tsx`.

Why not "just reposition the modal manually on `keyboardWillShow`": Android has no `keyboardWillShow` (only `keyboardDidShow`, which fires after the keyboard is already up — visible jank). The reanimated hook reads the system animation curve and keeps the sheet in lockstep with the keyboard on both platforms, with no listener bookkeeping. Don't reinvent it.

When adding a new `Modal`, sheet, or screen with a text input, decide which of the four patterns above applies *before* writing the layout, and copy the reference file's wiring. Don't ship a sheet with a `TextInput` and a plain `ScrollView` — the keyboard will obscure the input.

### Phase 5 — Usenet ✅
- [x] SABnzbd: queue, history, pause/resume/delete, add NZB by URL, dashboard widget, backend push notifications
- [x] NZBGet: queue, history, pause/resume/delete, add NZB by URL, dashboard widget, backend push notifications. Both clients render through a shared adapter (`lib/usenet-adapter.ts` + `lib/usenet-adapters/`) so the downloads view, queue widget, settings sheet, and backend completion-diff are one source of truth for both.

## File Structure Conventions
- Expo Router file-based routing in `app/` directory
- `services/` — raw API call functions (fetch to service REST APIs)
- `hooks/` — TanStack Query wrappers around services (caching, polling, mutations)
- `components/ui/` — reusable UI primitives
- `components/dashboard/` — dashboard card components
- `components/common/` — shared layout components
- `components/overseerr/` — Seerr-specific components (posters, media detail; folder name kept for back-compat)
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

## GitHub Pages Site
- Served from `docs/` on the `main` branch: https://renzobeux.github.io/Dashboarr/
- `docs/index.html` — landing page (hero + store links, features, supported services with icons, FAQ)
- `docs/guide.html` — user documentation (install, adding services, local/remote URLs, per-service reference table, dashboards & widgets, tabs, notifications & backend, backup, troubleshooting)
- `docs/privacy-policy.html` — privacy policy (required for Play Store and App Store)
- `docs/assets/style.css` — shared base styles (tokens, nav, buttons, cards, tables, callouts, footer). Page-specific rules stay in a `<style>` block in that page.
- `docs/assets/services/*` — service logos, copied from `assets/services/` and downscaled to 160px. **When adding a service, copy its icon here too** and add a `.service-card` to the services grid.
- `docs/assets/icon.png` — app icon (favicon + hero), downscaled from `assets/icon.png`
- **Keep the site in sync** when adding/removing a service, changing major features, or updating download links. The landing page states counts ("19 services", "25 widgets") — update them alongside `SERVICE_IDS` and `DASHBOARD_WIDGET_IDS` in `lib/constants.ts`.
- Plain HTML + CSS, no build step and no external requests (no CDNs, no web fonts). Icons are inline SVG.
- The guide documents real UI labels and navigation paths. Verify against the code before changing a documented label, and update the guide when a flow it describes changes.

## What NOT to Build
- No user accounts or authentication beyond service API keys
- No monetization or credit system
- No feedback or support mechanisms
- Single-user per install — no multi-user or shared access features
