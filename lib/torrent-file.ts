import { File } from "expo-file-system";

// A local .torrent picked with the document picker or handed to the app by the
// OS ("Open in Dashboarr" on iOS, a VIEW intent on Android). `uri` is what the
// platform gave us (file:// on iOS and for picker cache copies, content:// for
// Android intents); `name` is the original filename when known.
export interface TorrentFileSource {
  uri: string;
  name: string;
}

// rtorrent (load.raw_start), Transmission (metainfo) and Deluge (filedump) all
// take the .torrent as base64 text inside the RPC body, so the adapters read
// the file once here and hand the encoded content to the service layer.
// qBittorrent is the exception: it takes a multipart file part, and React
// Native's fetch streams that from the URI directly (see addTorrentFile in
// services/qbittorrent-api.ts).
export function readTorrentFileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

// Drop our local copy once the client has it. Picker copies live in the cache
// dir and iOS "Open in" copies land in Documents/Inbox, where they pile up
// forever otherwise. Android content:// URIs belong to another app and are
// left alone. Never throws — cleanup must not turn a successful add into an
// error.
export function discardTorrentFile(uri: string): void {
  if (!/^file:\/\//i.test(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone or not ours to delete.
  }
}

// Best-effort filename for an OS-delivered file the intent didn't name. The
// Android content resolver exposes the display name through the SAF document;
// an iOS Inbox file:// URL carries it in the path.
export function torrentFileName(uri: string): string | undefined {
  try {
    const name = new File(uri).name;
    return name || undefined;
  } catch {
    return undefined;
  }
}
