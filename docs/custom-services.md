# Custom services

The **Custom** service kind lets you connect Dashboarr to any JSON HTTP API
that isn't one of the built-in integrations. Instead of shipping a new
integration for every possible tool, you describe the API's shape once — how
to authenticate, what a healthy response looks like, which fields to show as
stats, and which endpoints to call as actions — and Dashboarr does the rest.

A custom service definition is plain JSON with six top-level keys, all of
them optional except that `health.path` is required for the health check to
run:

```json
{
  "auth": { "...": "..." },
  "login": { "...": "..." },
  "health": { "...": "..." },
  "stats": [{ "...": "..." }],
  "actions": [{ "...": "..." }],
  "timeoutSeconds": 10
}
```

## Fields

### `auth`

Describes how every request (other than the optional login step) is
authenticated.

| Field | Type | Notes |
|---|---|---|
| `mode` | `"none" \| "header" \| "query" \| "basic" \| "bearer"` | Required whenever `auth` is present. |
| `headerName` | string | Header name to send the credential under, for `mode: "header"`. |
| `queryParam` | string | Query string parameter name, for `mode: "query"`. |
| `username` | string | Used for `mode: "basic"`, and as the `{{username}}` value in a `login.body`. |
| `password` | string | Used for `mode: "basic"`, and as the `{{password}}` value in a `login.body`. |
| `token` | string | The bearer token / header value / query value sent for `mode: "bearer"`, `"header"`, or `"query"`. |

`mode: "none"` means no per-request credential is added by the `auth` block
itself — this is normal for services whose only auth is the login step
below, or for services with no auth at all.

### `login` (optional)

Some APIs require a separate sign-in call before any other endpoint will
respond (session cookie, short-lived token, etc.). When `login` is present,
Dashboarr runs it once and reuses the result for subsequent requests until it
expires or a request is rejected.

| Field | Type | Notes |
|---|---|---|
| `method` | `"GET" \| "POST"` | |
| `path` | string | Relative to the service's base URL. |
| `contentType` | string | e.g. `application/x-www-form-urlencoded` or `application/json`. |
| `body` | string | Request body. May contain the placeholders `{{username}}` / `{{password}}`, which are substituted from `auth.username` / `auth.password`. |
| `captureCookie` | string | Name of a `Set-Cookie` cookie to capture from the login response. Accepts `*` wildcards (glob) for services whose cookie name varies — whichever cookie actually matches is the one injected, under its real name. For example qBittorrent 5.1+ names its session cookie `QBT_SID_<port>` (port-suffixed), so use `*SID*` there instead of a literal `SID` (older qBittorrent builds that still set plain `SID` also match `*SID*`). |
| `captureJSONPath` | string | Path (see [Path syntax](#path-syntax)) into the login response body to capture a token/value instead of a cookie. |
| `injectAs` | `"header" \| "query" \| "cookie" \| "bearer"` | How the captured value is attached to later requests. |
| `injectName` | string | Header or query parameter name to inject the captured value as, when relevant. |

### `health`

The check Dashboarr polls to decide whether the service is online, and
where its version comes from.

| Field | Type | Notes |
|---|---|---|
| `method` | `"GET" \| "POST"` | |
| `path` | string | **Required.** Relative to the base URL. |
| `body` | string | Request body, for `POST`. |
| `statusPath` | string | Path into the response used to determine status. Leave empty to treat any 2xx response as online. |
| `okValues` | string[] | Values at `statusPath` that mean "online". Empty means any value (still gated on 2xx) counts as online. |
| `warnValues` | string[] | Values at `statusPath` that mean "degraded" rather than fully down. |
| `versionPath` | string | Path into the response to read the service's version string from. Leave empty if the whole body already is the version (e.g. a plain-text response). |

### `stats`

Up to **8** entries, each pulling one value out of the health response to
show on the card:

| Field | Type | Notes |
|---|---|---|
| `label` | string | Required. Shown next to the value. |
| `path` | string | Required. Path into the health response. |
| `unit` | string | Optional display unit. |
| `format` | `"number" \| "bytes" \| "duration" \| "percent" \| "text"` | How to render the value. |

### `actions`

Up to **8** entries, each a button that fires a request against the
service:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Required. Must match `/^[a-z0-9-]+$/`. |
| `label` | string | Required. Button text. |
| `method` | `"GET" \| "POST" \| "PUT" \| "DELETE"` | |
| `path` | string | Required. Relative to the base URL. |
| `body` | string | Request body. |
| `confirm` | boolean | When true, the user is asked to confirm before the action runs. |

### `timeoutSeconds`

Optional per-request timeout, in seconds, for calls made against this
service.

## Path syntax

Paths (in `health.statusPath`, `health.versionPath`, `login.captureJSONPath`,
and every `stats[].path`) address a value inside a JSON response body:

- **Dotted keys** walk into nested objects: `application.version` reaches
  `{"application": {"version": "1.2.3"}}`.
- **Array indexes** are dotted numbers: `results.0.name` reaches the `name`
  field of the first element of the `results` array.
- **`#`** on an array gives its length: `torrents.#` is how many items are
  in the `torrents` array.
- **`[*]`** collects a field across every element of an array, e.g.
  `torrents.[*].hash` returns every torrent's `hash`.

An empty path means "use the whole response body as-is" — useful for
endpoints that return a bare version string or a plain-text `OK`.

## Importing a preset

1. Go to **Settings → Custom** (or add a new service and choose the
   **Custom** kind).
2. Choose **Import JSON**.
3. Paste the contents of one of the preset files in `presets/`, or upload
   the file directly.
4. Fill in the service's base URL and any credentials the preset leaves
   blank (API key, username/password, bearer token).
5. Save. Dashboarr immediately runs the health check to confirm the
   definition works against your instance.

Presets are starting points — after importing, you can edit any field
(add more stats, tweak paths, add actions) the same way as a hand-written
definition.

## Presets

| Preset | Auth | Base URL points at | What it needs from you |
|---|---|---|---|
| `cleanuparr.json` | Header (`X-Api-Key`) | Cleanuparr instance | API key |
| `home-assistant.json` | Bearer | Home Assistant instance | Long-lived access token |
| `audiobookshelf.json` | Bearer | Audiobookshelf instance | API token |
| `slskd.json` | Header (`X-API-Key`) | slskd instance | API key |
| `azuracast.json` | None | AzuraCast instance | Nothing — public status endpoint |
| `dozzle.json` | None | Dozzle instance | Nothing — public healthcheck endpoint |
| `qbittorrent.json` | Login (cookie) | qBittorrent WebUI | WebUI username and password |
