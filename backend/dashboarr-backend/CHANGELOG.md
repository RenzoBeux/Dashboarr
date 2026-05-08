# Changelog

All notable changes to the Dashboarr backend are documented in this file.
Going forward, releases and entries below are managed automatically by
[release-please](https://github.com/googleapis/release-please) — do not edit
this file by hand for new versions.

## [1.2.0](https://github.com/RenzoBeux/Dashboarr/compare/backend-v1.1.0...backend-v1.2.0) (2026-05-08)


### Features

* add automated release management with release-please configuration and changelogs ([e81510a](https://github.com/RenzoBeux/Dashboarr/commit/e81510aafebdd53cc956e25218c4b238405446d1))
* add BACKEND_USE_REMOTE configuration to control service polling URL routing ([1cd5e5e](https://github.com/RenzoBeux/Dashboarr/commit/1cd5e5e3daafa611f1b2a06fb397ea77519a3e23))
* add category to QBTorrent and implement management check for Radarr/Sonarr to dedup notifications ([da2203a](https://github.com/RenzoBeux/Dashboarr/commit/da2203adf953f936340f9906557eae772850fb10))
* add Jellyfin support with new API integration and UI components ([ebb8897](https://github.com/RenzoBeux/Dashboarr/commit/ebb8897f3808821935d65cbd655dd3a9dc4a8634))
* add OFFLINE_THRESHOLD configuration for service health checks and notifications ([f1b36a7](https://github.com/RenzoBeux/Dashboarr/commit/f1b36a7b5475ce65453f7824447c48cbb7f55644))
* add optional backend ([e530067](https://github.com/RenzoBeux/Dashboarr/commit/e53006727f1b3e5f7a0ec0e3f122d1af43f0c8cc))
* add test notification handling for Overseerr, Radarr, and Sonarr webhooks ([06e501f](https://github.com/RenzoBeux/Dashboarr/commit/06e501f03bc8b120be9d047a74f1cce8bfc598fc))
* backend auth hardening — header webhooks, rate limits, off-stdout secrets ([36ddb3e](https://github.com/RenzoBeux/Dashboarr/commit/36ddb3e405c9baa62416ce9c3233bbca69281804))
* enhance activeBaseUrl function to fallback on secondary URL for improved service reachability ([eb566e7](https://github.com/RenzoBeux/Dashboarr/commit/eb566e7d96c68e35e3a31e82a5d8cc6ebf1994bc))
* enhance QR code pairing process with optional URL encoding for single-scan setup ([30b0f04](https://github.com/RenzoBeux/Dashboarr/commit/30b0f04e4c98779b108c1fecf85755fdea64ce22))
* enhance Sonarr and Radarr queue item display titles with additional metadata ([eae4d68](https://github.com/RenzoBeux/Dashboarr/commit/eae4d685991a581c14c83c9c8ca30d82d50d148b))
* enhance torrent state handling with completed state checks and notifications on Backend ([0b29971](https://github.com/RenzoBeux/Dashboarr/commit/0b29971e344a72add68ee0fdc391b57b94ccbba7))
* implement encryption for secrets and add passphrase prompt ([b03fc7b](https://github.com/RenzoBeux/Dashboarr/commit/b03fc7b84bb188812b05a3cbae95367cf9f1aa14))
* implement multi-instance support for webhooks and polling ([7806074](https://github.com/RenzoBeux/Dashboarr/commit/78060746fd9e413c071630be9db33e33d89f0d19))
* implement notification handling for Radarr and Sonarr, enhancing routing based on notification data ([ebb9665](https://github.com/RenzoBeux/Dashboarr/commit/ebb966567ea7f388b7ec603decbe110c4480349a))
* implement Wake-on-LAN configuration and functionality across the application ([379ddcd](https://github.com/RenzoBeux/Dashboarr/commit/379ddcdc01970b4e0fdcc7f35e09f3da5f240933))
* rename Overseerr to Seerr across documentation and codebase for consistency ([f346c4f](https://github.com/RenzoBeux/Dashboarr/commit/f346c4f8701c9dd1bc4daa257b451106ec6c4de0))
* update documentation and backend integration for improved user experience ([7fef1da](https://github.com/RenzoBeux/Dashboarr/commit/7fef1da0fdc4059d5dc9b0d96a910a2bfcf01219))
* update torrent state handling and API compatibility for qBittorrent 5.0 and Seerr sort fix ([643f9b8](https://github.com/RenzoBeux/Dashboarr/commit/643f9b81d84a95ea9340c1a87eb1cfa26ce125a7))
* update version to 1.2.0, add unsaved changes alert in settings, and implement buildUrl utility for API requests ([e28aa76](https://github.com/RenzoBeux/Dashboarr/commit/e28aa767ec4a5fd332907af50ad9a63bd04bd752))
* upgrade Node.js version to 22-alpine in Dockerfile for improved performance and security ([e8b9510](https://github.com/RenzoBeux/Dashboarr/commit/e8b9510dcdd873fc8748bd29b6a7eacdbe002fac))


### Bug Fixes

* upgrade apk packages in Dockerfile for improved stability ([aafc1ac](https://github.com/RenzoBeux/Dashboarr/commit/aafc1ac7e9ca799fc09a383845f53360474b48f6))

## [1.1.0](https://github.com/renzobeux/dashboarr/compare/backend-v1.0.5...backend-v1.1.0) (2026-05-07)

### Features

* implement encryption for secrets and add passphrase prompt
* backend auth hardening — header webhooks, rate limits, off-stdout secrets
* implement multi-instance support for webhooks and polling
* enhance torrent state handling with completed state checks and notifications
* update torrent state handling and API compatibility for qBittorrent 5.0
* add Jellyfin support with new API integration
* rename Overseerr to Seerr across documentation and codebase for consistency
* implement buildUrl utility for API requests

### Miscellaneous

* bump fastify

## [1.0.5](https://github.com/renzobeux/dashboarr/compare/backend-v1.0.4...backend-v1.0.5) (2026-04-17)

### Features

* enhance activeBaseUrl function to fallback on secondary URL for improved service reachability
* add BACKEND_USE_REMOTE configuration to control service polling URL routing

## [1.0.4](https://github.com/renzobeux/dashboarr/compare/backend-v1.0.3...backend-v1.0.4) (2026-04-16)

### Features

* add OFFLINE_THRESHOLD configuration for service health checks and notifications
* implement notification handling for Radarr and Sonarr, enhancing routing based on notification data
* enhance Sonarr and Radarr queue item display titles with additional metadata
* add category to qBittorrent and implement management check for Radarr/Sonarr to dedup notifications
* add test notification handling for Overseerr, Radarr, and Sonarr webhooks

## 1.0.3 (2026-04-15)

Initial tracked release. Earlier history is available in the git log.
