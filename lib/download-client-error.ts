/**
 * Rewrites the misleading download-client errors the *arr apps hand back on a
 * grab (issue #329).
 *
 * When a release is already in qBittorrent, the toast used to read
 * "Failed to connect to qBittorrent, check your settings." even though the
 * connection was fine. That string is not ours: Dashboarr shows the *arr's
 * `{ message }` body verbatim (lib/http-client.ts `getHttpErrorMessage`). The
 * chain, verified in upstream source:
 *
 *   1. qBittorrent 5.1+ answers `POST /api/v2/torrents/add` with 409 Conflict
 *      and an empty body when it added nothing:
 *        src/webui/api/torrentscontroller.cpp `addAction()` ends with
 *        `else throw APIError(APIErrorType::Conflict);`
 *      A duplicate infohash is exactly that case:
 *        src/base/addtorrentmanager.cpp `processTorrent()` returns false when
 *        `btSession()->findTorrent(infoHash)` already has it.
 *      qBittorrent 5.0 and older instead answer 200 with the body "Fails.".
 *   2. Radarr/Sonarr/Prowlarr share one qBittorrent proxy. Any non-401/403
 *      HttpException becomes a fixed string:
 *        src/NzbDrone.Core/Download/Clients/QBittorrent/QBittorrentProxyV2.cs
 *        `ProcessRequest` -> `DownloadClientException("Failed to connect to
 *        qBittorrent, check your settings.")`
 *      and the "Fails." body becomes `"Download client failed to add torrent
 *      by url"` (same file, `AddTorrentFromUrl`).
 *   3. Dashboarr relays that message.
 *
 * The *arr reply carries nothing that separates "already added" from "client
 * unreachable", so we cannot state one as fact. What we can do is stop leading
 * with the wrong one: put the common cause first and keep the connectivity
 * possibility in the same sentence.
 *
 * The rewrite is deliberately scoped to grab call sites rather than applied
 * inside `getHttpErrorMessage`, because the same *arr string is genuinely about
 * connectivity when it shows up outside an add-torrent request.
 */

// "Failed to connect to qBittorrent, check your settings." — also emitted with
// "please check your settings." and for Deluge/Transmission/uTorrent/Flood/
// Hadouken/NZBGet/NzbVortex, which is why the client name is captured.
const CLIENT_UNREACHABLE =
  /^failed to connect to (.+?),\s*(?:please\s+)?check your settings\.?$/i;

// "Download client failed to add torrent by url" / "...add torrent". The client
// answered, it just refused the release, so no name is included upstream.
const ADD_REFUSED = /^download client failed to add torrent(?: by url)?\.?$/i;

/**
 * Given the message an *arr returned for a failed grab, produce a clearer one.
 * Returns `undefined` when the message is not one of the known-misleading
 * strings, so callers fall through to showing the server message as-is.
 *
 * @param message   the *arr's `{ message }` body
 * @param arrLabel  the app that was asked to grab, e.g. "Radarr"
 */
export function describeGrabFailure(
  message: string,
  arrLabel: string,
): string | undefined {
  const trimmed = message.trim();

  const unreachable = CLIENT_UNREACHABLE.exec(trimmed);
  if (unreachable) {
    const client = unreachable[1];
    return `${client} did not accept the release. It is most likely already added; if it isn't, check that ${arrLabel} can reach ${client}.`;
  }

  if (ADD_REFUSED.test(trimmed)) {
    return `${arrLabel}'s download client did not accept the release. It is most likely already added.`;
  }

  return undefined;
}

/**
 * What Dashboarr throws when it adds a torrent to qBittorrent itself (Downloads
 * tab, Jackett grab) and qBittorrent reports that nothing was added. Same
 * qBittorrent behaviour as above, minus the *arr in the middle: a 409 (5.1+) or
 * a "Fails." body (5.0 and older). `addTorrent` also returns false for an
 * unparseable magnet, so the link is named as the second possibility.
 */
export const QB_ADD_REFUSED_MESSAGE =
  "qBittorrent did not add this torrent. It is most likely already in the client; otherwise the magnet or torrent link is invalid.";
