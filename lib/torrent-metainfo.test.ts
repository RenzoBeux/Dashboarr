import { readTorrentInfo } from "./torrent-metainfo";

const enc = (s: string) => new TextEncoder().encode(s);

describe("readTorrentInfo", () => {
  it("reads info.name from a minimal torrent", () => {
    const t = enc(
      "d8:announce10:http://tr/4:infod6:lengthi1e4:name4:Test12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaaee",
    );
    expect(readTorrentInfo(t)).toEqual({ name: "Test" });
  });

  it("prefers name.utf-8 and decodes multibyte names", () => {
    const name = "Ünïcode";
    const utf8 = new TextEncoder().encode(name);
    const parts = [
      enc("d4:infod4:name3:old"),
      enc(`10:name.utf-8${utf8.length}:`),
      utf8,
      enc("ee"),
    ];
    const t = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let o = 0;
    for (const p of parts) {
      t.set(p, o);
      o += p.length;
    }
    expect(readTorrentInfo(t)).toEqual({ name: name });
  });

  it("skips nested lists and a large pieces blob without choking", () => {
    const pieces = "x".repeat(200_000);
    const t = enc(
      `d13:announce-listll9:http://a/el9:http://b/ee4:infod5:filesld6:lengthi1e4:pathl1:aeee4:name3:Dir6:pieces${pieces.length}:${pieces}ee`,
    );
    expect(readTorrentInfo(t)).toEqual({ name: "Dir" });
  });

  it("returns a null name when info has no name", () => {
    expect(readTorrentInfo(enc("d4:infod6:lengthi1eee"))).toEqual({
      name: null,
    });
  });

  it("survives a file packed with millions of empty values without allocating them", () => {
    // ~2 MB of "le" pairs under a key before info: a value-per-object parser
    // would build a million arrays here.
    const filler = "le".repeat(900_000);
    const t = enc(`d1:al${filler}e4:infod4:name2:Okee`);
    expect(readTorrentInfo(t)).toEqual({ name: "Ok" });
  });

  it("gives up on hostile nesting and value counts", () => {
    const deep = enc(
      `d1:a${"l".repeat(100)}${"e".repeat(100)}4:infod4:name1:xee`,
    );
    expect(readTorrentInfo(deep)).toBeNull();
    const many = enc(`d1:al${"le".repeat(2_100_000)}e4:infod4:name1:xee`);
    expect(readTorrentInfo(many)).toBeNull();
  });

  it("uses the first info dictionary and ignores a non-dict info", () => {
    expect(readTorrentInfo(enc("d4:info3:abce"))).toBeNull();
    expect(
      readTorrentInfo(enc("d4:infod4:name1:Ae4:infod4:name1:Bee")),
    ).toEqual({ name: "A" });
  });

  it("rejects anything that is not a torrent dictionary", () => {
    expect(readTorrentInfo(enc(""))).toBeNull();
    expect(readTorrentInfo(enc('{"json":true}'))).toBeNull();
    expect(readTorrentInfo(enc("d8:announce3:urle"))).toBeNull(); // no info
    expect(readTorrentInfo(enc("l4:infoe"))).toBeNull(); // list root
    expect(readTorrentInfo(enc("d4:info4:name"))).toBeNull(); // truncated
    expect(readTorrentInfo(enc("d4:infod4:name99:abcee"))).toBeNull(); // bad length
    expect(
      readTorrentInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47])),
    ).toBeNull(); // PNG
  });
});

import { safeTorrentFileName } from "./torrent-metainfo";

describe("safeTorrentFileName", () => {
  it("keeps an ordinary name and normalizes the extension", () => {
    expect(safeTorrentFileName("Some Release")).toBe("Some Release.torrent");
    expect(safeTorrentFileName("Some Release.TORRENT")).toBe(
      "Some Release.torrent",
    );
    expect(safeTorrentFileName("a.b.c.torrent")).toBe("a.b.c.torrent");
  });

  it("cannot escape a directory or hide the file", () => {
    expect(safeTorrentFileName("../../target")).toBe("target.torrent");
    expect(safeTorrentFileName("..")).toBe("upload.torrent");
    expect(safeTorrentFileName("../")).toBe("upload.torrent");
    expect(safeTorrentFileName("C:\\Users\\x\\evil")).toBe("evil.torrent");
    expect(safeTorrentFileName("/etc/passwd")).toBe("passwd.torrent");
    expect(safeTorrentFileName(".hidden")).toBe("hidden.torrent");
    expect(safeTorrentFileName("name\u0000.torrent\n")).toBe("name.torrent");
  });

  it("falls back and caps the length", () => {
    expect(safeTorrentFileName(undefined)).toBe("upload.torrent");
    expect(safeTorrentFileName("   ")).toBe("upload.torrent");
    const long = "x".repeat(500);
    expect(safeTorrentFileName(long)).toBe(`${"x".repeat(200)}.torrent`);
  });
});
