import { File, Paths } from "expo-file-system";
import { copyAsync } from "expo-file-system/legacy";
import { readTorrentInfo, safeTorrentFileName } from "@/lib/torrent-metainfo";

// A local .torrent that passed inspectTorrentFile. `uri` is always a file://
// path the app can read again (a picker cache copy, an iOS Inbox file, or our
// own cache copy of an Android content:// document); `name` is the sanitized
// filename sent to clients that want one; `title` is info.name from the
// metainfo, for display.
export interface TorrentFileSource {
  uri: string;
  name: string;
  title?: string;
}

// Hard cap on what we are willing to read into memory. Real .torrent files are
// tens of KB to a few MB (the piece hashes); the cap only exists so a wrong
// pick in the wildcard document picker (a video, a disk image) is refused
// before it is read, not after it has exhausted memory.
export const MAX_TORRENT_FILE_BYTES = 16 * 1024 * 1024;

const TOO_LARGE = "File is too large to be a .torrent (over 16 MB)";

// Reads at most MAX + 1 bytes through a file handle so an oversized file is
// detected without being loaded whole. Only called on file:// paths, where
// the handle (a RandomAccessFile on Android) is available; if it still isn't,
// the reported size of a plain file is reliable enough to gate a full read.
async function readBounded(file: File): Promise<Uint8Array> {
  let handle: ReturnType<File["open"]> | undefined;
  try {
    handle = file.open();
  } catch {
    handle = undefined;
  }
  if (handle) {
    try {
      return handle.readBytes(MAX_TORRENT_FILE_BYTES + 1);
    } finally {
      handle.close();
    }
  }
  if (file.size > MAX_TORRENT_FILE_BYTES) throw new Error(TOO_LARGE);
  return file.bytes();
}

// An Android content:// document can't be opened as a handle, and a provider
// may report its size as 0 when it doesn't know it, so nothing about it can
// be read in a bounded way in place. Stream it into our own cache file first
// (the legacy copyAsync goes through the ContentResolver without buffering
// the whole thing) and inspect that copy instead. The copy is app-owned, so
// the normal discard path cleans it up.
async function stageContentUri(uri: string): Promise<File> {
  const copy = new File(
    Paths.cache,
    `torrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.torrent`,
  );
  await copyAsync({ from: uri, to: copy.uri });
  return copy;
}

// Validates a local file before it is staged for upload: extension when a
// filename is known (picker, iOS Inbox), then size, then content (a bencoded
// dictionary with an `info` dictionary). Throws a user-facing Error on any
// failure, never holds more than the cap in memory, and never leaves a copy
// of its own behind on failure.
export async function inspectTorrentFile(
  uri: string,
  fileName?: string,
): Promise<TorrentFileSource> {
  const ext = fileName?.match(/\.([A-Za-z0-9]{1,10})$/)?.[1];
  if (ext && ext.toLowerCase() !== "torrent") {
    throw new Error("Only .torrent files can be added");
  }

  const isContentUri = /^content:\/\//i.test(uri);
  const file = isContentUri ? await stageContentUri(uri) : new File(uri);
  try {
    const bytes = await readBounded(file);
    if (bytes.byteLength > MAX_TORRENT_FILE_BYTES) throw new Error(TOO_LARGE);
    if (bytes.byteLength === 0) throw new Error("File is empty or could not be read");
    const info = readTorrentInfo(bytes);
    if (!info) throw new Error("Not a valid .torrent file");
    return {
      uri: file.uri,
      name: safeTorrentFileName(fileName?.trim() || info.name),
      title: info.name ?? undefined,
    };
  } catch (err) {
    if (isContentUri) discardTorrentFile(file.uri);
    throw err;
  }
}

// rtorrent (load.raw_start), Transmission (metainfo) and Deluge (filedump) all
// take the .torrent as base64 text inside the RPC body, so the adapters read
// the file once here and hand the encoded content to the service layer. Only
// sources that passed inspectTorrentFile reach this, so the read is bounded.
// qBittorrent is the exception: it takes a multipart file part, and React
// Native's fetch streams that from the URI directly (see addTorrentFile in
// services/qbittorrent-api.ts).
export function readTorrentFileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

// Drop our local copy once it is no longer needed: after a successful add,
// and whenever the user abandons it (cancel, remove, dismissed destination
// picker, no client configured). Picker copies live in the cache dir and iOS
// "Open in" copies land in Documents/Inbox, where they pile up forever
// otherwise. Android content:// URIs belong to another app and are left
// alone. Never throws — cleanup must not turn a successful add into an error.
export function discardTorrentFile(uri: string): void {
  if (!/^file:\/\//i.test(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone or not ours to delete.
  }
}
