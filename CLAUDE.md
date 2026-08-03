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

## Architecture Rules
- Primarily client-side: the app talks directly to service APIs, with no server in the request path
- Each service is its own isolated module/integration
- All service credentials and URLs live in a single config file (never hardcoded)
- Local/remote URL switching per service (WiFi-based auto-detection via expo-location, or manual toggle)
- SSL/TLS and reverse proxy support for all connections
- Every service communicates via its official REST API using API keys
- Optional backend (`backend/dashboarr-backend`) is a standalone Node.js service for push notification relay — not required for core functionality

## Service API Documentation (sources of truth)
Upstream API docs and per-service gotchas live in the `service-apis` skill (`.claude/skills/service-apis/SKILL.md`). Load it before implementing or debugging any service integration, and prefer fetching the relevant doc page over guessing endpoint shapes.

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

## File Structure Conventions
- `components/overseerr/` — Seerr-specific components (posters, media detail; folder name kept for back-compat)
- No index files — import directly from source files

## Config Export/Import & Versioned Migrations
- Config backup lives in `store/config-store.ts` (export/import) + `store/config-migrations.ts` (migration chain)
- `CURRENT_CONFIG_VERSION` in `config-migrations.ts` is the source of truth for the schema version
- Export always writes `CURRENT_CONFIG_VERSION`; import detects the version and chains migrations up
- Migration functions live in a `migrations` record keyed by source version: `N: (payload) => ({ ...transformed, version: N+1 })`
- After migration, import merges services over `defaultServices()` so newly added services get defaults instead of `undefined`
- **When changing the export schema** (new field, renamed field, new service, etc.), the two steps the source comment in `config-migrations.ts` does *not* cover:
  1. Update `ExportPayload` interface in `config-store.ts`
  2. Update `exportConfig` / `importConfig` to handle the new data

## GitHub Pages Site
- The site lives in `docs/` and has its own `docs/CLAUDE.md` with the full file-by-file reference.
- **Cross-cutting rule:** when adding or removing a service (or a dashboard widget) in `lib/constants.ts`, update `docs/` in the same change: copy the service icon to `docs/assets/services/`, add its `.service-card`, and fix the service/widget counts stated on the landing page.

## What NOT to Build
- No user accounts or authentication beyond service API keys
- No monetization or credit system
- No feedback or support mechanisms
- Single-user per install — no multi-user or shared access features
