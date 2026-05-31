import { XMLParser } from "fast-xml-parser";

// Minimal XML-RPC serialize/deserialize for the rtorrent transport. Kept pure
// (no store/service knowledge) so it's unit-testable and reusable. Request
// bodies are built by string concatenation (no DOM); responses are parsed with
// fast-xml-parser (pure-JS, Hermes-safe — React Native has no DOMParser).

export type XmlRpcParam =
  | { t: "string"; v: string }
  | { t: "int"; v: number }
  | { t: "i8"; v: number }
  | { t: "base64"; v: string } // value is already base64-encoded
  | { t: "array"; v: XmlRpcParam[] };

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Coerce to a wire-safe integer: a non-finite input (NaN/Infinity) would
// otherwise serialize to <i4>NaN</i4> / <i8>Infinity</i8>, which rtorrent
// rejects as a malformed integer. Degrade to 0 instead.
function intText(v: number): string {
  return String(Number.isFinite(v) ? Math.trunc(v) : 0);
}

function serializeValue(p: XmlRpcParam): string {
  switch (p.t) {
    case "string":
      return `<value><string>${escapeXml(p.v)}</string></value>`;
    case "int":
      return `<value><i4>${intText(p.v)}</i4></value>`;
    case "i8":
      return `<value><i8>${intText(p.v)}</i8></value>`;
    case "base64":
      return `<value><base64>${p.v}</base64></value>`;
    case "array":
      return `<value><array><data>${p.v.map(serializeValue).join("")}</data></array></value>`;
  }
}

export function buildMethodCall(method: string, params: XmlRpcParam[]): string {
  const body = params.map((p) => `<param>${serializeValue(p)}</param>`).join("");
  return `<?xml version="1.0"?><methodCall><methodName>${escapeXml(method)}</methodName><params>${body}</params></methodCall>`;
}

// system.multicall batches N calls in one round-trip. Each entry is a struct
// {methodName, params}. Built inline (struct isn't part of XmlRpcParam since
// this is the only place that needs it).
export function buildSystemMulticall(
  calls: { method: string; params: XmlRpcParam[] }[],
): string {
  const structs = calls
    .map(({ method, params }) => {
      const paramsArray = `<value><array><data>${params.map(serializeValue).join("")}</data></array></value>`;
      return (
        `<value><struct>` +
        `<member><name>methodName</name><value><string>${escapeXml(method)}</string></value></member>` +
        `<member><name>params</name>${paramsArray}</member>` +
        `</struct></value>`
      );
    })
    .join("");
  return (
    `<?xml version="1.0"?><methodCall><methodName>system.multicall</methodName>` +
    `<params><param><value><array><data>${structs}</data></array></value></param></params></methodCall>`
  );
}

const parser = new XMLParser({
  ignoreAttributes: true,
  // Keep leaf text as strings — we read i4/i8/string explicitly so a numeric-
  // looking <string> (e.g. an all-digits label or a 40-char hex hash) isn't
  // silently coerced to a number.
  parseTagValue: false,
  // d.multicall2 returns array-of-arrays; fast-xml-parser collapses a
  // single-child array, so a 1-torrent library would decode differently from a
  // many-torrent one. Forcing <value> and <member> to always be arrays makes
  // the shape stable regardless of count. This is the single most important
  // option here — see lib/xmlrpc.test.ts.
  isArray: (name) => name === "value" || name === "member",
});

export class XmlRpcFault extends Error {
  constructor(
    public faultCode: number,
    public faultString: string,
  ) {
    super(`XML-RPC fault ${faultCode}: ${faultString}`);
    this.name = "XmlRpcFault";
  }
}

// Recursively decode a parsed <value> node into a JS value. Dispatches on the
// type tag: i4/int/i8/double → number, boolean → bool, string/base64 → string,
// array → JS array, struct → object.
function decodeValue(node: unknown): unknown {
  if (node == null) return "";
  if (typeof node !== "object") return node; // bare text leaf
  const v = node as Record<string, unknown>;
  if ("i4" in v || "int" in v) return Number(v.i4 ?? v.int);
  if ("i8" in v) return Number(v.i8); // 64-bit byte counts
  if ("double" in v) return Number(v.double);
  if ("boolean" in v) return v.boolean === "1" || v.boolean === 1 || v.boolean === true;
  if ("string" in v) return typeof v.string === "object" ? "" : String(v.string ?? "");
  if ("base64" in v) return String(v.base64 ?? "");
  if ("dateTime.iso8601" in v) return String(v["dateTime.iso8601"] ?? "");
  if ("array" in v) {
    const arr = v.array as Record<string, unknown> | undefined;
    const data = arr?.data as Record<string, unknown> | undefined;
    const values = (data?.value as unknown[]) ?? [];
    return values.map(decodeValue);
  }
  if ("struct" in v) {
    const members = ((v.struct as Record<string, unknown>)?.member as unknown[]) ?? [];
    const out: Record<string, unknown> = {};
    for (const m of members) {
      const mm = m as { name?: unknown; value?: unknown };
      const name = typeof mm.name === "string" ? mm.name : String(mm.name ?? "");
      // value is forced to an array by isArray; take the first.
      const memberValue = Array.isArray(mm.value) ? mm.value[0] : mm.value;
      if (name) out[name] = decodeValue(memberValue);
    }
    return out;
  }
  if ("#text" in v) return String(v["#text"]);
  return "";
}

// Walk methodResponse → params/param/value (returning the decoded value), or
// throw XmlRpcFault on a <fault> response. Returns undefined for a void method.
export function parseMethodResponse(xml: string): unknown {
  const root = parser.parse(xml) as Record<string, unknown>;
  const resp = root.methodResponse as Record<string, unknown> | undefined;
  if (!resp) throw new Error("Malformed XML-RPC response (no methodResponse)");

  if (resp.fault) {
    const faultVal = (resp.fault as Record<string, unknown>).value;
    const faultNode = Array.isArray(faultVal) ? faultVal[0] : faultVal;
    const fault = decodeValue(faultNode) as {
      faultCode?: number;
      faultString?: string;
    };
    throw new XmlRpcFault(
      Number(fault?.faultCode ?? -1),
      String(fault?.faultString ?? "unknown"),
    );
  }

  const params = resp.params as Record<string, unknown> | undefined;
  const param = Array.isArray(params?.param)
    ? (params!.param as unknown[])[0]
    : params?.param;
  const value = (param as Record<string, unknown> | undefined)?.value;
  const valueNode = Array.isArray(value) ? value[0] : value;
  if (valueNode === undefined) return undefined;
  return decodeValue(valueNode);
}
