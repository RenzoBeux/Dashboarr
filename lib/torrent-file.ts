import { File, Paths } from "expo-file-system";
import { readAsStringAsync } from "expo-file-system/legacy";
import { base64ToBytes } from "@/lib/base64";
import {
  scanTorrentInfo,
  safeTorrentFileName,
  type TorrentInfo,
} from "@/lib/torrent-metainfo";

// A local .torrent that passed inspectTorrentFile. `uri` is an app-owned
// cache file holding exactly the verified metainfo bytes (never more than the
// cap), which is what every client uploads; `sourceUri` is what the platform
// handed us (a picker cache copy or an iOS Inbox file as file://, an Android
// document as content://), kept only so it can be cleaned up with the copy;
// `name` is the sanitized filename sent to clients that want one; `title` is
// info.name from the metainfo, for display.
export interface TorrentFileSource {
  uri: string;
  sourceUri: string;
  name: string;
  title?: string;
}

// Hard cap on what we are willing to read into memory. Real .torrent files are
// tens of KB to a few MB (the piece hashes); the cap only exists so a wrong
// pick in the wildcard document picker (a video, a disk image) is refused
// before it is read, not after it has exhausted memory.
export const MAX_TORRENT_FILE_BYTES = 16 * 1024 * 1024;

const CHUNK = 1024 * 1024;
const TOO_LARGE = "File is too large to be a .torrent (over 16 MB)";
const NOT_A_TORRENT = "Not a valid .torrent file";

// Reads the source in fixed chunks, re-scanning the metainfo after each one,
// and stops the moment the root dictionary is complete, the bytes are
// provably not a torrent, or the cap is exceeded. So neither memory nor disk
// ever holds more than cap + one chunk, and a wrong pick (a video) is refused
// after its first chunk. The legacy read honours `position` + `length` on
// both platforms and on Android opens content:// documents through the
// ContentResolver, which is what makes this work in place for an
// OS-delivered document with no filename and an unreliable reported size.
//
// No end-of-file signal is relied on: the scanner decides. That matters
// because the platforms disagree at EOF (iOS answers an empty chunk, Android
// throws — its read returns -1, which the base64 encoder rejects) and a
// content provider may short-read mid-stream, so neither an empty nor a
// short chunk is a safe stop. A read failure after data was already read is
// treated as EOF (only reachable with an incomplete document).
async function readMetainfo(
  uri: string,
): Promise<{ info: TorrentInfo; bytes: Uint8Array }> {
  let buf = new Uint8Array(0);
  for (;;) {
    let b64: string;
    try {
      b64 = await readAsStringAsync(uri, {
        encoding: "base64",
        position: buf.byteLength,
        length: CHUNK,
      });
    } catch (err) {
      if (buf.byteLength === 0) throw err;
      break;
    }
    const chunk = base64ToBytes(b64);
    if (chunk.byteLength === 0) break;
    const next = new Uint8Array(buf.byteLength + chunk.byteLength);
    next.set(buf, 0);
    next.set(chunk, buf.byteLength);
    buf = next;
    if (buf.byteLength > MAX_TORRENT_FILE_BYTES) throw new Error(TOO_LARGE);
    const scan = scanTorrentInfo(buf);
    // Only the bytes the scanner walked are the torrent. Whatever follows the
    // root dictionary is dropped here, so a tiny valid torrent glued to a
    // huge payload is never read past this point by anyone.
    if (scan.ok) return { info: scan.info, bytes: buf.subarray(0, scan.end) };
    if (!scan.truncated) throw new Error(NOT_A_TORRENT);
  }
  if (buf.byteLength === 0)
    throw new Error("File is empty or could not be read");
  throw new Error(NOT_A_TORRENT);
}

// Validates a local file before it is staged for upload: extension when a
// filename is known (picker, iOS Inbox), then size and content (a bencoded
// dictionary with an `info` dictionary) in one bounded pass. The verified
// bytes are written to an app-owned cache file and that copy is what gets
// uploaded, so the clients' later reads are bounded by construction and the
// original (which may carry anything after the metainfo) is never sent.
// Throws a user-facing Error on any failure and never holds more than the
// cap in memory.
export async function inspectTorrentFile(
  uri: string,
  fileName?: string,
): Promise<TorrentFileSource> {
  const ext = fileName?.match(/\.([A-Za-z0-9]{1,10})$/)?.[1];
  if (ext && ext.toLowerCase() !== "torrent") {
    throw new Error("Only .torrent files can be added");
  }

  const { info, bytes } = await readMetainfo(uri);
  const copy = new File(
    Paths.cache,
    `torrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.torrent`,
  );
  copy.write(bytes);
  return {
    uri: copy.uri,
    sourceUri: uri,
    name: safeTorrentFileName(fileName?.trim() || info.name),
    title: info.name ?? undefined,
  };
}

// rtorrent (load.raw_start), Transmission (metainfo) and Deluge (filedump) all
// take the .torrent as base64 text inside the RPC body, so the adapters read
// the file once here and hand the encoded content to the service layer. Only
// the verified copy inspectTorrentFile wrote reaches this, so the read is
// bounded by the cap. qBittorrent is the exception: it takes a multipart
// file part, and React Native's fetch streams that copy from disk directly
// (see addTorrentFile in services/qbittorrent-api.ts).
export function readTorrentFileBase64(uri: string): Promise<string> {
  return new File(uri).base64();
}

// Drop everything we hold for a staged torrent once it is no longer needed:
// after a successful add, and whenever the user abandons it (cancel, remove,
// dismissed destination picker, no client configured). That is our verified
// cache copy plus the original when it is ours to delete: picker copies live
// in the cache dir and iOS "Open in" copies land in Documents/Inbox, where
// they pile up forever otherwise. Android content:// originals belong to
// another app and are left alone.
export function discardTorrentSource(file: TorrentFileSource): void {
  discardTorrentFile(file.uri);
  discardTorrentFile(file.sourceUri);
}

// Deletes one local file:// path. Never throws — cleanup must not turn a
// successful add into an error.
export function discardTorrentFile(uri: string): void {
  if (!/^file:\/\//i.test(uri)) return;
  try {
    new File(uri).delete();
  } catch {
    // Already gone or not ours to delete.
  }
}
