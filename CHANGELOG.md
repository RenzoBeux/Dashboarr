# Changelog

All notable changes to the Dashboarr app are documented in this file. Going
forward, releases and entries below are managed automatically by
[release-please](https://github.com/googleapis/release-please) — do not edit
this file by hand for new versions.

## [1.5.0](https://github.com/RenzoBeux/Dashboarr/compare/v1.4.2...v1.5.0) (2026-05-08)


### Features

* add Android signing configuration and update scripts ([2236d01](https://github.com/RenzoBeux/Dashboarr/commit/2236d01dca1b9dce252f39fef9480ad0f4fe2a2b))
* add AppVersionCard component to display app version and check for updates ([5cd7934](https://github.com/RenzoBeux/Dashboarr/commit/5cd7934a85768c30cca36196e60b565471f9d766))
* add automated release management with release-please configuration and changelogs ([e81510a](https://github.com/RenzoBeux/Dashboarr/commit/e81510aafebdd53cc956e25218c4b238405446d1))
* add BACKEND_USE_REMOTE configuration to control service polling URL routing ([1cd5e5e](https://github.com/RenzoBeux/Dashboarr/commit/1cd5e5e3daafa611f1b2a06fb397ea77519a3e23))
* add Bazarr integration for missing subtitles management ([a13273d](https://github.com/RenzoBeux/Dashboarr/commit/a13273d5a03f27c741bd88f1b984ce0ecbced437))
* add Codemagic workflow for iOS Release to TestFlight ([159ee03](https://github.com/RenzoBeux/Dashboarr/commit/159ee0383af777742beb5c8d5a5c1a9687b4028b))
* add comprehensive API documentation for service integrations in CLAUDE.md ([dce5a62](https://github.com/RenzoBeux/Dashboarr/commit/dce5a62468f7686c2798da7a325762dde5d0e5b7))
* add dashboard picker sheet component for managing dashboards ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* add demo mode functionality with sample data responses for apple app store submission :eyesroll: ([ef0f366](https://github.com/RenzoBeux/Dashboarr/commit/ef0f366116fee908ea6eb4a6c7bf791560f615c9))
* add expandable text component for collapsible text display ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* add functionality to clear image cache in settings ([bb6a01f](https://github.com/RenzoBeux/Dashboarr/commit/bb6a01fd512483262d07aeed1ea4aaf43f8a4b13))
* add GitHub issue reporting and about section in settings ([5c402ad](https://github.com/RenzoBeux/Dashboarr/commit/5c402adf2b4a10dc90c16dd6bd92a2660fa25bdf))
* add global and per-service custom headers support ([96db111](https://github.com/RenzoBeux/Dashboarr/commit/96db1118e408b686bc9914d7d0d00c90b9cd413a))
* add haptic feedback settings and migration support ([0caf5ab](https://github.com/RenzoBeux/Dashboarr/commit/0caf5abe47de742ab29ccff444f22ea1d0a409f8))
* add iOS entitlements for Wi-Fi info access and update location permission handling in Wi-Fi detection ([f9c6074](https://github.com/RenzoBeux/Dashboarr/commit/f9c6074745c77342c4514153191b6a70a73c739d))
* add Jellyfin support with new API integration and UI components ([ebb8897](https://github.com/RenzoBeux/Dashboarr/commit/ebb8897f3808821935d65cbd655dd3a9dc4a8634))
* add loading skeleton matching the new media detail layout [#36](https://github.com/RenzoBeux/Dashboarr/issues/36) ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* add media stats strip component for displaying media statistics ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* add monitor filter functionality to Movies and TV screens ([5a9db66](https://github.com/RenzoBeux/Dashboarr/commit/5a9db6661ae9e0db444e2ed36cff12b20678b5c0))
* add optional backend ([e530067](https://github.com/RenzoBeux/Dashboarr/commit/e53006727f1b3e5f7a0ec0e3f122d1af43f0c8cc))
* add per-instance routing for API calls across services ([6b6c36f](https://github.com/RenzoBeux/Dashboarr/commit/6b6c36fe4eabddf052feb8b864b4d1afce11a81c))
* add Prowlarr stats settings with instance selection ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* add request options sheet for Seerr movie/TV requests ([5138af3](https://github.com/RenzoBeux/Dashboarr/commit/5138af3b6e0dad0d84cb4e40c263f7a01c71718a))
* add ServiceLogo component to handle SVG and PNG logos for services ([f398f23](https://github.com/RenzoBeux/Dashboarr/commit/f398f239ffc994ad308e20b34dc3988db9c6b4ce))
* add SilentErrorBoundary for improved error handling in root components ([9002d20](https://github.com/RenzoBeux/Dashboarr/commit/9002d20307227e5c09084c73aa0229e7780d36f0))
* add sorting functionality to Movies, Plex, TV, and Requests screens ([f7d8044](https://github.com/RenzoBeux/Dashboarr/commit/f7d8044d06bba04683f6c16f72452a3efc388ee0))
* add star history section to README :) ([4de6af2](https://github.com/RenzoBeux/Dashboarr/commit/4de6af2d53beba28930ef1cd2cc9f221c269cc69))
* add support for including unmonitored items in calendar queries [#32](https://github.com/RenzoBeux/Dashboarr/issues/32) ([27c37ef](https://github.com/RenzoBeux/Dashboarr/commit/27c37ef8418b98b4de2e9b5cc58e04b9e32bdc40))
* add toast notification for unexpected Overseerr response shape ([e7c646e](https://github.com/RenzoBeux/Dashboarr/commit/e7c646ebc594028391eca6a6cb2f73a25aabaadc))
* add update movie quality profile mutation hook for Radarr ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* add update series quality profile mutation hook for Sonarr ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* add Wake-on-LAN functionality with device management and dashboard integration ([d09e0b2](https://github.com/RenzoBeux/Dashboarr/commit/d09e0b2cfe830ec09a0ebdf09b4c55b39d784373))
* BSSID pinning for WiFi auto-switch ([42a04ab](https://github.com/RenzoBeux/Dashboarr/commit/42a04abc4501d9c8100dcea7c9712d86e41821ba))
* configure NetInfo to fetch WiFi SSID on iOS for improved connectivity ([b87628e](https://github.com/RenzoBeux/Dashboarr/commit/b87628e9d24bcdea3af607b351f2f141ac89ebd3))
* create instance picker row for selecting instances in widget settings ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* create media detail hero component for displaying media information ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* create Speed stats settings with instance selection for qBittorrent ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* enable cleartext traffic for self-hosted services on iOS ([747e611](https://github.com/RenzoBeux/Dashboarr/commit/747e611f4e3ad3ab7968b782ef00478f378d90bf))
* enhance APK release process and update version checking logic ([50f9d35](https://github.com/RenzoBeux/Dashboarr/commit/50f9d3503a1e4e74e9dcdbca1d015e50f1acda0d))
* enhance iOS cookie management for qBittorrent API integration ([0da6a00](https://github.com/RenzoBeux/Dashboarr/commit/0da6a008aa6478766777978d7fc8add2084ef58d))
* enhance media handling and UI components ([14cabdd](https://github.com/RenzoBeux/Dashboarr/commit/14cabddf365c8d421e06aa93d45665cf4baee692))
* enhance OTA update check with error handling and improve state management ([d304a4b](https://github.com/RenzoBeux/Dashboarr/commit/d304a4bfe5b99713bfd632e352690a11ae35194f))
* enhance QR code pairing process with optional URL encoding for single-scan setup ([30b0f04](https://github.com/RenzoBeux/Dashboarr/commit/30b0f04e4c98779b108c1fecf85755fdea64ce22))
* enhance screen wrapper to support edge-to-edge content ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* enhance series and movie management features ([6b39e5c](https://github.com/RenzoBeux/Dashboarr/commit/6b39e5c31d31978b4db7ed6bb38fa39603947f0c))
* enhance settings screen with new notification and settings components ([eaed15b](https://github.com/RenzoBeux/Dashboarr/commit/eaed15bba16669f49ff37ef8c9815a9d239beb2f))
* enhance torrent state handling with completed state checks and notifications on Backend ([0b29971](https://github.com/RenzoBeux/Dashboarr/commit/0b29971e344a72add68ee0fdc391b57b94ccbba7))
* implement app update check functionality ([8d34485](https://github.com/RenzoBeux/Dashboarr/commit/8d34485c1ead2b91724ce66a6a154daf48269de4))
* implement BackHeader component for consistent navigation across screens ([ffd0828](https://github.com/RenzoBeux/Dashboarr/commit/ffd0828185972164a9678cabfdd4dd6a8ee981ba))
* implement Bazarr wanted settings with instance picker ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* implement claiming reference to prevent multiple claims during scanning ([05f26e9](https://github.com/RenzoBeux/Dashboarr/commit/05f26e979d02ae5e6e30c472c7b31660fd0c7464))
* implement config export/import with versioned migrations for enhanced schema management ([fbc09bc](https://github.com/RenzoBeux/Dashboarr/commit/fbc09bc57cb4ca5b71f660a81d20c70185279c70))
* implement encryption for secrets and add passphrase prompt ([b03fc7b](https://github.com/RenzoBeux/Dashboarr/commit/b03fc7b84bb188812b05a3cbae95367cf9f1aa14))
* implement glass tab bar effect and enhance UI components with GlassSurface ([956914b](https://github.com/RenzoBeux/Dashboarr/commit/956914b48a19c23ca3f2a7c4f66b0c5d12b7dde7))
* implement home network management with auto-switching capabilities ([e562662](https://github.com/RenzoBeux/Dashboarr/commit/e562662c36750c04c1920664323f1e644d67609c))
* implement interactive release search and selection for Radarr and Sonarr ([5719891](https://github.com/RenzoBeux/Dashboarr/commit/5719891d7d30c6b08775db7d603daedca9631132))
* implement localDateKey utility for consistent date handling across components [#33](https://github.com/RenzoBeux/Dashboarr/issues/33) ([1f1ba80](https://github.com/RenzoBeux/Dashboarr/commit/1f1ba800e0e8c21ac3798831033ced5cc69ed017))
* implement media action bar with animated action pills ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* implement multi-instance support across various dashboard components ([c45bfeb](https://github.com/RenzoBeux/Dashboarr/commit/c45bfeb328b1b0eaafc681961e2614d78bf802a1))
* implement multi-instance support for qBittorrent and Radarr ([aac891b](https://github.com/RenzoBeux/Dashboarr/commit/aac891be5aa5b167f49369ca73ebffaa20058139))
* implement multi-instance support for webhooks and polling ([7806074](https://github.com/RenzoBeux/Dashboarr/commit/78060746fd9e413c071630be9db33e33d89f0d19))
* implement notification handling for Radarr and Sonarr, enhancing routing based on notification data ([ebb9665](https://github.com/RenzoBeux/Dashboarr/commit/ebb966567ea7f388b7ec603decbe110c4480349a))
* implement Radarr queue settings with instance and max items selection ([c5503e0](https://github.com/RenzoBeux/Dashboarr/commit/c5503e0a1ac66ae5a500375bb0e52cac08a944be))
* implement speed limits feature with UI and API integration ([73f0fba](https://github.com/RenzoBeux/Dashboarr/commit/73f0fbaf216546c954ed874d279045be456d45fc))
* implement UI scale feature for accessibility ([#7](https://github.com/RenzoBeux/Dashboarr/issues/7)) ([d0ef94f](https://github.com/RenzoBeux/Dashboarr/commit/d0ef94f673416bd0bfb87ef95527b1b9e2ac899f))
* implement URL redaction for sensitive parameters in service requests ([c5c78d5](https://github.com/RenzoBeux/Dashboarr/commit/c5c78d508625a6af591340067d86696567c9a009))
* implement Wake-on-LAN configuration and functionality across the application ([379ddcd](https://github.com/RenzoBeux/Dashboarr/commit/379ddcdc01970b4e0fdcc7f35e09f3da5f240933))
* implement widget settings for downloads, overseerr requests, plex now playing, and tautulli activity components ([c151d2d](https://github.com/RenzoBeux/Dashboarr/commit/c151d2dcdf7898a387f9de1554baab49522d972d))
* increment versionCode to 5 in app configuration ([c77feb6](https://github.com/RenzoBeux/Dashboarr/commit/c77feb69f6a3ac5c350b785cbefab494e010a381))
* integrate EAS updates and configure production channels in app settings ([085652c](https://github.com/RenzoBeux/Dashboarr/commit/085652c3e532b97307401850d5d50c83d737f6dd))
* integrate KeyboardAwareScrollView for improved keyboard handling and update version to 1.2.2 ([8f4861a](https://github.com/RenzoBeux/Dashboarr/commit/8f4861a0bedf5a2b02c2ac33d457dea36de37d6c))
* migrate to multi-instance service configuration ([45c9e10](https://github.com/RenzoBeux/Dashboarr/commit/45c9e10ee988f1824d1d72272fd1bf3bef897999))
* refactor dashboard components to improve media display and loading states ([92e4215](https://github.com/RenzoBeux/Dashboarr/commit/92e42153af353e4696560d281ba8c1d0c139af3c))
* refactor image imports and enhance image handling across components ([afe2a97](https://github.com/RenzoBeux/Dashboarr/commit/afe2a97d25b4d1a065519b7c4ed1a5bd97278fdc))
* refactor instance binding to support multi-select for widgets ([369437a](https://github.com/RenzoBeux/Dashboarr/commit/369437a7f89ac747a503a7e75f59dd4a2dc469a4))
* refactor season count calculation in SeriesDetailScreen for improved readability ([51abb52](https://github.com/RenzoBeux/Dashboarr/commit/51abb52a8d39749fb16997e9001bf82541b531dc))
* refactor torrent handling with improved hooks and server-side pagination ([8335c13](https://github.com/RenzoBeux/Dashboarr/commit/8335c1386fb9d9dea748df7a7ded43b37232e55a))
* rename Overseerr to Seerr across documentation and codebase for consistency ([f346c4f](https://github.com/RenzoBeux/Dashboarr/commit/f346c4f8701c9dd1bc4daa257b451106ec6c4de0))
* Rotate secret button on Backend screen ([323a264](https://github.com/RenzoBeux/Dashboarr/commit/323a264a3a2458da9666a6d2626fb351615252f6))
* settings UI for BSSID pinning ([263f45f](https://github.com/RenzoBeux/Dashboarr/commit/263f45fe6a51c336d5a06930227977e6fc884ce6))
* swipe-down gesture dismissal for bottom sheets ([71ad51b](https://github.com/RenzoBeux/Dashboarr/commit/71ad51b1d2a5d33378e366f8e00e5b63946690bc))
* update app version to use value from package.json ([9e69877](https://github.com/RenzoBeux/Dashboarr/commit/9e69877b302f7e200c5f862c44b1708c452610e3))
* update Codemagic workflow for iOS Production Build and improve build scripts ([e3825ef](https://github.com/RenzoBeux/Dashboarr/commit/e3825effe81c488f719c0fb56e347e4e9fd46c25))
* update documentation and backend integration for improved user experience ([7fef1da](https://github.com/RenzoBeux/Dashboarr/commit/7fef1da0fdc4059d5dc9b0d96a910a2bfcf01219))
* update EmptyState component to support compact variant for better layout in dashboard widgets [#39](https://github.com/RenzoBeux/Dashboarr/issues/39) ([ac24f65](https://github.com/RenzoBeux/Dashboarr/commit/ac24f650698eae3e7378e028bffe21315c3d6d1b))
* update icon generation script and assets for improved visuals ([353a732](https://github.com/RenzoBeux/Dashboarr/commit/353a73276b28397bb1a8e280d66234c0b2d08bc6))
* update torrent state handling and API compatibility for qBittorrent 5.0 and Seerr sort fix ([643f9b8](https://github.com/RenzoBeux/Dashboarr/commit/643f9b81d84a95ea9340c1a87eb1cfa26ce125a7))
* update version codes in app.config.ts and package.json ([e621a8f](https://github.com/RenzoBeux/Dashboarr/commit/e621a8f64c22df40a12805d757a6a4f935e53402))
* update version to 1.2.0, add unsaved changes alert in settings, and implement buildUrl utility for API requests ([e28aa76](https://github.com/RenzoBeux/Dashboarr/commit/e28aa767ec4a5fd332907af50ad9a63bd04bd752))


### Bug Fixes

* add cssInterop for expo-image to enable NativeWind styling ([8a658f8](https://github.com/RenzoBeux/Dashboarr/commit/8a658f8da079d8a17140b6057302d0b1a24a0ec7))
* downgrade expo-image to 3.0.11 and expo-linear-gradient to 15.0.8 for compatibility ([7630443](https://github.com/RenzoBeux/Dashboarr/commit/7630443e42b9d0a7ae1d9a3e10abb4fd6461ebef))
* encode url to handle spaces ([5a4360a](https://github.com/RenzoBeux/Dashboarr/commit/5a4360a82cd0bcfb6edf0610415e0ca9a2f3cc31))
* improve resolution formatting to account for cinemascope cropped resolutions ([1d22901](https://github.com/RenzoBeux/Dashboarr/commit/1d22901de1aa4d1e801424daeb2e95d229586b7c))
* **ios:** bump netinfo to 12.0.1 to use NEHotspotNetwork API for SSID detection on iOS 17+ ([#27](https://github.com/RenzoBeux/Dashboarr/issues/27)) ([55c8117](https://github.com/RenzoBeux/Dashboarr/commit/55c8117a32e67b7a1765e71f0ae71e390f03b6c9))
* keep keyboard from obscuring inputs in sheets, and unblock iOS config import ([cf42993](https://github.com/RenzoBeux/Dashboarr/commit/cf4299380ee3cb1a73045720092fb11786e31a7a))
* remove unnecessary dev dependencies and add peer dependencies in package-lock.json ([5673422](https://github.com/RenzoBeux/Dashboarr/commit/56734220baea9b3261e319bbd103ad88087d88f0))
* update Expo prebuild command to use pnpm exec for iOS workflow ([77008aa](https://github.com/RenzoBeux/Dashboarr/commit/77008aa805e07475cb454fd8de345852cd63a053))

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
