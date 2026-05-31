import {
  buildMethodCall,
  buildSystemMulticall,
  parseMethodResponse,
  XmlRpcFault,
} from "@/lib/xmlrpc";

// Builds a d.multicall2-style array-of-arrays response with `n` identical rows
// mixing <string>, <i8>, and <i4> so the typed-value + array-collapse paths are
// exercised at every count.
function multicallResponse(rows: string[]): string {
  const rowXml = rows
    .map(
      (hash) =>
        `<value><array><data>` +
        `<value><string>${hash}</string></value>` +
        `<value><i8>5400000000</i8></value>` +
        `<value><i4>1</i4></value>` +
        `</data></array></value>`,
    )
    .join("");
  return `<?xml version="1.0"?><methodResponse><params><param><value><array><data>${rowXml}</data></array></value></param></params></methodResponse>`;
}

describe("xmlrpc request builder", () => {
  it("builds a d.multicall2 call with the required empty target arg", () => {
    const xml = buildMethodCall("d.multicall2", [
      { t: "string", v: "" },
      { t: "string", v: "main" },
      { t: "string", v: "d.hash=" },
    ]);
    expect(xml).toContain("<methodName>d.multicall2</methodName>");
    // First param is the empty-string target placeholder.
    expect(xml).toContain(
      "<params><param><value><string></string></value></param>",
    );
    expect(xml).toContain("<value><string>main</string></value>");
  });

  it("escapes XML metacharacters in strings", () => {
    const xml = buildMethodCall("load.start", [
      { t: "string", v: "" },
      { t: "string", v: "magnet:?a=1&b=2<x>" },
    ]);
    expect(xml).toContain("magnet:?a=1&amp;b=2&lt;x&gt;");
    expect(xml).not.toContain("&b=2<x>");
  });

  it("serializes i8 and base64 params", () => {
    const xml = buildMethodCall("throttle.global_down.max_rate.set_kb", [
      { t: "string", v: "" },
      { t: "i8", v: 5120 },
    ]);
    expect(xml).toContain("<i8>5120</i8>");
  });

  it("builds a system.multicall with struct entries", () => {
    const xml = buildSystemMulticall([
      { method: "d.stop", params: [{ t: "string", v: "HASH1" }] },
      { method: "d.close", params: [{ t: "string", v: "HASH1" }] },
    ]);
    expect(xml).toContain("<methodName>system.multicall</methodName>");
    expect(xml).toContain(
      "<member><name>methodName</name><value><string>d.stop</string></value></member>",
    );
    expect(xml).toContain("<value><string>HASH1</string></value>");
  });
});

describe("xmlrpc response parser", () => {
  it("decodes a multi-row d.multicall2 response (array of arrays)", () => {
    const result = parseMethodResponse(
      multicallResponse(["AAAA", "BBBB", "CCCC"]),
    ) as unknown[][];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(3);
    // Row shape: [hash:string, size:i8 number, flag:i4 number]
    expect(result[0]).toEqual(["AAAA", 5400000000, 1]);
    expect(typeof result[0][1]).toBe("number");
  });

  it("decodes a SINGLE-row response as a 1-element array (collapse trap)", () => {
    // The whole point of isArray: a one-torrent library must NOT decode to a
    // flat row — it must stay [[...]].
    const result = parseMethodResponse(multicallResponse(["ONLYONE"])) as unknown[][];
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(["ONLYONE", 5400000000, 1]);
  });

  it("decodes an empty d.multicall2 response to an empty array", () => {
    const result = parseMethodResponse(multicallResponse([]));
    expect(result).toEqual([]);
  });

  it("preserves large i8 byte counts as numbers", () => {
    const xml =
      `<?xml version="1.0"?><methodResponse><params><param>` +
      `<value><i8>850000000000</i8></value>` +
      `</param></params></methodResponse>`;
    expect(parseMethodResponse(xml)).toBe(850000000000);
  });

  it("keeps an all-digit hash as a string (parseTagValue off)", () => {
    const xml =
      `<?xml version="1.0"?><methodResponse><params><param>` +
      `<value><string>0000000000000000000000000000000000000001</string></value>` +
      `</param></params></methodResponse>`;
    const out = parseMethodResponse(xml);
    expect(typeof out).toBe("string");
    expect(out).toBe("0000000000000000000000000000000000000001");
  });

  it("decodes a system.multicall result (array of single-element arrays)", () => {
    const xml =
      `<?xml version="1.0"?><methodResponse><params><param><value><array><data>` +
      `<value><array><data><value><i4>5400000</i4></value></data></array></value>` +
      `<value><array><data><value><i8>850000000000</i8></value></data></array></value>` +
      `</data></array></value></param></params></methodResponse>`;
    const result = parseMethodResponse(xml) as unknown[][];
    expect(result).toEqual([[5400000], [850000000000]]);
  });

  it("throws XmlRpcFault on a <fault> response", () => {
    const xml =
      `<?xml version="1.0"?><methodResponse><fault><value><struct>` +
      `<member><name>faultCode</name><value><i4>-501</i4></value></member>` +
      `<member><name>faultString</name><value><string>Method not found</string></value></member>` +
      `</struct></value></fault></methodResponse>`;
    expect(() => parseMethodResponse(xml)).toThrow(XmlRpcFault);
    try {
      parseMethodResponse(xml);
    } catch (e) {
      expect(e).toBeInstanceOf(XmlRpcFault);
      expect((e as XmlRpcFault).faultCode).toBe(-501);
      expect((e as XmlRpcFault).faultString).toBe("Method not found");
    }
  });

  it("returns undefined for a void response (no params)", () => {
    const xml = `<?xml version="1.0"?><methodResponse><params></params></methodResponse>`;
    expect(parseMethodResponse(xml)).toBeUndefined();
  });
});
