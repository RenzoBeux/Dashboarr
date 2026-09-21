import { base64ToBytes } from "./base64";

const roundTrip = (s: string) =>
  new TextDecoder().decode(
    base64ToBytes(Buffer.from(s, "utf-8").toString("base64")),
  );

describe("base64ToBytes", () => {
  it("decodes padded and unpadded input", () => {
    expect(roundTrip("")).toBe("");
    expect(roundTrip("f")).toBe("f");
    expect(roundTrip("fo")).toBe("fo");
    expect(roundTrip("foo")).toBe("foo");
    expect(roundTrip("foobar")).toBe("foobar");
    expect(new TextDecoder().decode(base64ToBytes("Zm9v"))).toBe("foo");
    expect(new TextDecoder().decode(base64ToBytes("Zm8"))).toBe("fo");
  });

  it("decodes binary and ignores whitespace", () => {
    const bytes = Uint8Array.from({ length: 256 }, (_, i) => i);
    const b64 = Buffer.from(bytes).toString("base64");
    expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    expect(Array.from(base64ToBytes(b64.replace(/(.{10})/g, "$1\n")))).toEqual(
      Array.from(bytes),
    );
  });

  it("rejects garbage", () => {
    expect(() => base64ToBytes("Zm9v!!")).toThrow();
  });
});
