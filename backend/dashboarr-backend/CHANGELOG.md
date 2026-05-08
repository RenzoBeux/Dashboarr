# Changelog

All notable changes to the Dashboarr backend are documented in this file.
Going forward, releases and entries below are managed automatically by
[release-please](https://github.com/googleapis/release-please) — do not edit
this file by hand for new versions.

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
