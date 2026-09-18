// Minimal bencode reader for .torrent files. Pure (no RN/Expo imports) so it
// is unit-testable and cheap to call before a file is handed to a client:
// it answers "is this a torrent at all?" and "what is it called?" from the
// bytes, which no download client tells us before the upload and which an
// Android content:// URI (no filename) cannot tell us either.
//
// Strings are returned as subarray views, so the multi-megabyte `pieces`
// blob is never copied.

type BValue = Uint8Array | number | BValue[] | BDict;
type BDict = Map<string, BValue>;

export interface TorrentInfo {
  // info.name (or info["name.utf-8"] when present), null when unreadable.
  name: string | null;
}

const decoder = new TextDecoder("utf-8");

class Reader {
  pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  private byte(): number {
    if (this.pos >= this.buf.length) throw new Error("truncated");
    return this.buf[this.pos];
  }

  // Digits up to (not including) `end`, returned as a number.
  private integer(end: number): number {
    const start = this.pos;
    while (this.byte() !== end) this.pos++;
    const text = decoder.decode(this.buf.subarray(start, this.pos));
    if (!/^-?\d+$/.test(text)) throw new Error("bad integer");
    this.pos++; // consume terminator
    return Number(text);
  }

  value(): BValue {
    const c = this.byte();
    if (c === 0x69 /* i */) {
      this.pos++;
      return this.integer(0x65 /* e */);
    }
    if (c === 0x6c /* l */) {
      this.pos++;
      const list: BValue[] = [];
      while (this.byte() !== 0x65) list.push(this.value());
      this.pos++;
      return list;
    }
    if (c === 0x64 /* d */) {
      this.pos++;
      const dict: BDict = new Map();
      while (this.byte() !== 0x65) {
        const key = this.value();
        if (!(key instanceof Uint8Array)) throw new Error("bad key");
        dict.set(decoder.decode(key), this.value());
      }
      this.pos++;
      return dict;
    }
    if (c >= 0x30 && c <= 0x39) {
      const len = this.integer(0x3a /* : */);
      if (len < 0 || this.pos + len > this.buf.length) throw new Error("bad string");
      const s = this.buf.subarray(this.pos, this.pos + len);
      this.pos += len;
      return s;
    }
    throw new Error("bad token");
  }
}

// Returns the torrent's metainfo, or null when the bytes are not a bencoded
// dictionary with an `info` dictionary (i.e. not a .torrent). Never throws.
export function readTorrentInfo(bytes: Uint8Array): TorrentInfo | null {
  try {
    const root = new Reader(bytes).value();
    if (!(root instanceof Map)) return null;
    const info = root.get("info");
    if (!(info instanceof Map)) return null;
    const raw = info.get("name.utf-8") ?? info.get("name");
    const name = raw instanceof Uint8Array ? decoder.decode(raw).trim() : "";
    return { name: name || null };
  } catch {
    return null;
  }
}
