// Minimal bencode scanner for .torrent files. Pure (no RN/Expo imports) so it
// is unit-testable and cheap to call before a file is handed to a client:
// it answers "is this a torrent at all?" and "what is it called?" from the
// bytes, which no download client tells us before the upload and which an
// Android content:// URI (no filename) cannot tell us either.
//
// It is a scanner, not a parser: only the root dictionary's keys and the
// `info` dictionary's `name` / `name.utf-8` values are ever materialized.
// Everything else (the multi-megabyte `pieces` blob, file lists, trackers)
// is skipped in place without allocating, so a crafted file packed with
// millions of tiny values costs a loop iteration each, never an object.
// Depth and value-count budgets bound even that.

export interface TorrentInfo {
  // info.name (or info["name.utf-8"] when present), null when unreadable.
  name: string | null;
}

// A real torrent nests 4-5 levels (root > info > files > entry > path) and
// holds a few thousand values; these are ceilings for hostile input only.
const MAX_DEPTH = 32;
const MAX_VALUES = 2_000_000;

const decoder = new TextDecoder("utf-8");

class Scanner {
  pos = 0;
  private values = 0;

  constructor(private readonly buf: Uint8Array) {}

  private peek(): number {
    if (this.pos >= this.buf.length) throw new Error("truncated");
    return this.buf[this.pos];
  }

  private budget(): void {
    if (++this.values > MAX_VALUES) throw new Error("too many values");
  }

  // Digits up to (not including) the `end` byte; consumes the terminator.
  private integer(end: number): number {
    const start = this.pos;
    while (this.peek() !== end) this.pos++;
    if (this.pos - start > 20) throw new Error("bad integer");
    const text = decoder.decode(this.buf.subarray(start, this.pos));
    if (!/^-?\d+$/.test(text)) throw new Error("bad integer");
    this.pos++;
    return Number(text);
  }

  // Positioned on a string's length digits: returns the [start, end) byte
  // range of its contents and moves past it. No copy.
  private stringRange(): [number, number] {
    this.budget();
    const len = this.integer(0x3a /* : */);
    if (len < 0 || this.pos + len > this.buf.length)
      throw new Error("bad string");
    const range: [number, number] = [this.pos, this.pos + len];
    this.pos += len;
    return range;
  }

  // Positioned on a dictionary key (always a string): returns it decoded.
  private key(): string {
    const c = this.peek();
    if (c < 0x30 || c > 0x39) throw new Error("bad key");
    const [s, e] = this.stringRange();
    return decoder.decode(this.buf.subarray(s, e));
  }

  // Moves past one value of any type without materializing it.
  skip(depth = 0): void {
    if (depth > MAX_DEPTH) throw new Error("too deep");
    const c = this.peek();
    if (c === 0x69 /* i */) {
      this.budget();
      this.pos++;
      this.integer(0x65 /* e */);
    } else if (c === 0x6c /* l */) {
      this.budget();
      this.pos++;
      while (this.peek() !== 0x65) this.skip(depth + 1);
      this.pos++;
    } else if (c === 0x64 /* d */) {
      this.budget();
      this.pos++;
      while (this.peek() !== 0x65) {
        this.key();
        this.skip(depth + 1);
      }
      this.pos++;
    } else if (c >= 0x30 && c <= 0x39) {
      this.stringRange();
    } else {
      throw new Error("bad token");
    }
  }

  // Expects a dictionary at the cursor; calls `onEntry` with each key
  // positioned on its value. The callback must consume the value (typically
  // via skip()).
  dict(onEntry: (key: string) => void): void {
    if (this.peek() !== 0x64) throw new Error("not a dict");
    this.budget();
    this.pos++;
    while (this.peek() !== 0x65) {
      onEntry(this.key());
    }
    this.pos++;
  }

  // Positioned on a value: returns it decoded if it is a string, else skips
  // it and returns null.
  stringOrSkip(): string | null {
    const c = this.peek();
    if (c < 0x30 || c > 0x39) {
      this.skip(1);
      return null;
    }
    const [s, e] = this.stringRange();
    return decoder.decode(this.buf.subarray(s, e));
  }
}

// Returns the torrent's metainfo, or null when the bytes are not a bencoded
// dictionary with an `info` dictionary (i.e. not a .torrent). Never throws.
export function readTorrentInfo(bytes: Uint8Array): TorrentInfo | null {
  try {
    const sc = new Scanner(bytes);
    let hasInfo = false;
    let name: string | null = null;
    let nameUtf8: string | null = null;
    sc.dict((key) => {
      if (key !== "info" || hasInfo) {
        sc.skip(1);
        return;
      }
      hasInfo = true;
      sc.dict((infoKey) => {
        if (infoKey === "name") name = sc.stringOrSkip();
        else if (infoKey === "name.utf-8") nameUtf8 = sc.stringOrSkip();
        else sc.skip(2);
      });
    });
    if (!hasInfo) return null;
    const picked = ((nameUtf8 ?? name) as string | null)?.trim() ?? "";
    return { name: picked || null };
  } catch {
    return null;
  }
}

// Filename handed to download clients that record one (Deluge's
// add_torrent_file, qBittorrent's multipart part). Every source is untrusted:
// info.name comes straight from the metainfo and a picker name from another
// app, and Deluge joins the name onto its torrent-copy directory. Keeps the
// last path segment only, drops control characters and leading/trailing
// dots and spaces (no "..", no hidden files), caps the length, and always
// ends in ".torrent".
export function safeTorrentFileName(name: string | null | undefined): string {
  const last = (name ?? "").split(/[\\/]/).pop() ?? "";
  let base = last
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\.torrent$/i, "")
    .replace(/^[\s.]+|[\s.]+$/g, "")
    .trim();
  if (base.length > 200) base = base.slice(0, 200).replace(/[\s.]+$/g, "");
  return `${base || "upload"}.torrent`;
}
