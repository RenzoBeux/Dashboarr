# Changelog

All notable changes to the Dashboarr app are documented in this file. Going
forward, releases and entries below are managed automatically by
[release-please](https://github.com/googleapis/release-please) — do not edit
this file by hand for new versions.

## [1.4.2](https://github.com/renzobeux/dashboarr/compare/v1.4.1...v1.4.2) (2026-05-08)

### Features

* add expandable text component for collapsible text display
* implement localDateKey utility for consistent date handling across components (#33)
* update EmptyState component to support compact variant for better layout in dashboard widgets (#39)

## [1.4.1](https://github.com/renzobeux/dashboarr/compare/v1.4.0...v1.4.1) (2026-05-08)

### Features

* add GitHub issue reporting and about section in settings

### Bug Fixes

* keep keyboard from obscuring inputs in sheets, and unblock iOS config import

## [1.4.0](https://github.com/renzobeux/dashboarr/compare/v1.3.9...v1.4.0) (2026-05-07)

Version bump release; no user-facing changes outside the 1.3.9 set.

## [1.3.9](https://github.com/renzobeux/dashboarr/compare/v1.3.8...v1.3.9) (2026-05-07)

### Features

* migrate to multi-instance service configuration
* implement multi-instance support across dashboard components, qBittorrent, and Radarr
* refactor instance binding to support multi-select for widgets
* implement multi-instance support for webhooks and polling
* add per-instance routing for API calls across services
* add dashboard picker sheet component for managing dashboards
* add ServiceLogo component to handle SVG and PNG logos for services
* implement UI scale feature for accessibility (#7)
* add support for including unmonitored items in calendar queries (#32)
* enhance settings screen with new notification and settings components

## [1.3.8](https://github.com/renzobeux/dashboarr/compare/v1.3.3...v1.3.8) (2026-05-06)

### Features

* implement home network management with auto-switching capabilities
* add global and per-service custom headers support
* implement interactive release search and selection for Radarr and Sonarr
* implement BackHeader component for consistent navigation across screens
* add functionality to clear image cache in settings
* refactor image imports and enhance image handling across components
* refactor dashboard components to improve media display and loading states
* add request options sheet for Seerr movie/TV requests
* refactor torrent handling with improved hooks and server-side pagination

### Bug Fixes

* (ios) bump netinfo to 12.0.1 to use NEHotspotNetwork API for SSID detection on iOS 17+ (#27)
* downgrade expo-image to 3.0.11 and expo-linear-gradient to 15.0.8 for compatibility
* add cssInterop for expo-image to enable NativeWind styling

## [1.3.3](https://github.com/renzobeux/dashboarr/compare/v1.3.0...v1.3.3) (2026-05-05)

### Features

* implement speed limits feature with UI and API integration
* update torrent state handling and API compatibility for qBittorrent 5.0
* rename Overseerr to Seerr across documentation and codebase for consistency
* add comprehensive API documentation for service integrations in CLAUDE.md

## [1.3.0](https://github.com/renzobeux/dashboarr/compare/v1.2.2...v1.3.0) (2026-05-04)

### Features

* add Jellyfin support with new API integration and UI components
* implement glass tab bar effect and enhance UI components with GlassSurface

## 1.2.2 (2026-05-04)

Initial tracked release. Earlier history is available in the git log.
