import { File } from "expo-file-system";
import { readTorrentInfo } from "@/lib/torrent-metainfo";

// A local .torrent picked with the document picker or handed to the app by the
// OS ("Open in Dashboarr" on iOS, a VIEW intent on Android), already checked
// by inspectTorrentFile. `uri` is what the platform gave us (file:// on iOS
// and for picker cache copies, content:// for Android intents); `name` is the
// filename sent to clients that want one; `title` is info.name from the
// metainfo, when readable.
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

// Reads at most MAX + 1 bytes so an oversized file is detected without being
// loaded whole. Goes through a file handle when the platform gives us one;
// a content:// provider that refuses a handle falls back to the size the
// resolver reports, and only then to a full read.
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

// Validates a local file before it is staged for upload: extension when a
// filename is known (picker, iOS Inbox), then size, then content (a bencoded
// dictionary with an `info` dictionary). Throws a user-facing Error on any
// failure and never holds more than the cap in memory.
export async function inspectTorrentFile(
  uri: string,
  fileName?: string,
): Promise<TorrentFileSource> {
  const ext = fileName?.match(/\.([A-Za-z0-9]{1,10})$/)?.[1];
  if (ext && ext.toLowerCase() !== "torrent") {
    throw new Error("Only .torrent files can be added");
  }

  const bytes = await readBounded(new File(uri));
  if (bytes.byteLength > MAX_TORRENT_FILE_BYTES) throw new Error(TOO_LARGE);
  if (bytes.byteLength === 0) throw new Error("File is empty or could not be read");
  const info = readTorrentInfo(bytes);
  if (!info) throw new Error("Not a valid .torrent file");

  const name =
    fileName?.trim() || (info.name ? `${info.name}.torrent` : "upload.torrent");
  return { uri, name, title: info.name ?? undefined };
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
