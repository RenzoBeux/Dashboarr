import { readTorrentInfo } from "./torrent-metainfo";

const enc = (s: string) => new TextEncoder().encode(s);

describe("readTorrentInfo", () => {
  it("reads info.name from a minimal torrent", () => {
    const t = enc("d8:announce10:http://tr/4:infod6:lengthi1e4:name4:Test12:piece lengthi16384e6:pieces20:aaaaaaaaaaaaaaaaaaaaee");
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
    expect(readTorrentInfo(enc("d4:infod6:lengthi1eee"))).toEqual({ name: null });
  });

  it("rejects anything that is not a torrent dictionary", () => {
    expect(readTorrentInfo(enc(""))).toBeNull();
    expect(readTorrentInfo(enc("{\"json\":true}"))).toBeNull();
    expect(readTorrentInfo(enc("d8:announce3:urle"))).toBeNull(); // no info
    expect(readTorrentInfo(enc("l4:infoe"))).toBeNull(); // list root
    expect(readTorrentInfo(enc("d4:info4:name"))).toBeNull(); // truncated
    expect(readTorrentInfo(enc("d4:infod4:name99:abcee"))).toBeNull(); // bad length
    expect(readTorrentInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull(); // PNG
  });
});
