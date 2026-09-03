# GitHub Pages Site (`docs/`)

- Served from `docs/` on the `main` branch: https://renzobeux.github.io/Dashboarr/
- `docs/index.html` — landing page (hero + store links, features, supported services with icons, FAQ)
- `docs/guide.html` — user documentation (install, adding services, local/remote URLs, per-service reference table, dashboards & widgets, tabs, notifications & backend, backup, troubleshooting)
- `docs/privacy-policy.html` — privacy policy (required for Play Store and App Store)
- `docs/assets/style.css` — shared base styles (tokens, nav, buttons, cards, tables, callouts, footer). Page-specific rules stay in a `<style>` block in that page.
- `docs/assets/services/*` — service logos, copied from `assets/services/` and downscaled to 160px. **When adding a service, copy its icon here too** and add a `.service-card` to the services grid.
- `docs/assets/icon.png` — app icon (favicon + hero), downscaled from `assets/icon.png`
- **Keep the site in sync** when adding/removing a service, changing major features, or updating download links. The landing page states counts (currently "29 services", "34 widgets", plus a spelled-out "Twenty-nine integrations" above the services grid) — update them alongside `SERVICE_IDS` and `DASHBOARD_WIDGET_IDS` in `lib/constants.ts`.
- Plain HTML + CSS, no build step and no external requests (no CDNs, no web fonts). Icons are inline SVG.
- The guide documents real UI labels and navigation paths. Verify against the code before changing a documented label, and update the guide when a flow it describes changes.
