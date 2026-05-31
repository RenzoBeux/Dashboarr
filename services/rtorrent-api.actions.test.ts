// Asserts the XML-RPC request bodies the action helpers build (method names,
// ordering, the load.start empty-target convention, command-arg sanitization)
// and the global-stats fault tolerance — paths the demo-mode test can't see
// because the demo router never echoes the request body. We mock the transport
// (serviceRequest) so we can capture each body and feed canned XML back through
// the real parser.

jest.mock("@/lib/http-client", () => ({
  serviceRequest: jest.fn(),
}));

import { serviceRequest } from "@/lib/http-client";
import {
  startTorrents,
  stopTorrents,
  eraseTorrents,
  addRtorrentTorrent,
  setRtorrentGlobalLimits,
  getRtorrentGlobalStats,
} from "@/services/rtorrent-api";

const mockServiceRequest = serviceRequest as jest.MockedFunction<
  typeof serviceRequest
>;

// Minimal well-formed responses so the real parser doesn't throw. Actions
// ignore the decoded value, so a trivial scalar is fine for them.
const SCALAR_OK_XML =
  '<?xml version="1.0"?><methodResponse><params><param><value><i4>0</i4></value></param></params></methodResponse>';

function lastBody(): string {
  const calls = mockServiceRequest.mock.calls;
  return (calls[calls.length - 1]![2] as { body: string }).body;
}

beforeEach(() => {
  mockServiceRequest.mockReset();
  mockServiceRequest.mockResolvedValue(SCALAR_OK_XML as never);
});

describe("rtorrent action request bodies", () => {
  it("start = d.open → d.start → d.resume per hash, in order", async () => {
    await startTorrents(["HASH1"]);
    const body = lastBody();
    expect(body).toContain("<methodName>system.multicall</methodName>");
    const open = body.indexOf("d.open");
    const start = body.indexOf("d.start");
    const resume = body.indexOf("d.resume");
    expect(open).toBeGreaterThanOrEqual(0);
    expect(open).toBeLessThan(start);
    expect(start).toBeLessThan(resume);
    expect(body).toContain("<value><string>HASH1</string></value>");
  });

  it("stop = d.stop → d.close per hash", async () => {
    await stopTorrents(["HASH1"]);
    const body = lastBody();
    expect(body.indexOf("d.stop")).toBeLessThan(body.indexOf("d.close"));
  });

  it("erase without data is a bare d.erase", async () => {
    await eraseTorrents(["HASH1"], false);
    const body = lastBody();
    expect(body).toContain("d.erase");
    expect(body).not.toContain("d.custom5.set");
    expect(body).not.toContain("d.delete_tied");
  });

  it("erase WITH data is d.custom5.set → d.delete_tied → d.erase, in order", async () => {
    await eraseTorrents(["HASH1"], true);
    const body = lastBody();
    const mark = body.indexOf("d.custom5.set");
    const untie = body.indexOf("d.delete_tied");
    const erase = body.indexOf("d.erase");
    expect(mark).toBeGreaterThanOrEqual(0);
    expect(mark).toBeLessThan(untie);
    expect(untie).toBeLessThan(erase);
    // custom5.set carries the erasedata marker value "1".
    expect(body).toContain("<value><string>1</string></value>");
  });

  it("no-op when given an empty hash list (no request sent)", async () => {
    await startTorrents([]);
    await stopTorrents([]);
    await eraseTorrents([], true);
    expect(mockServiceRequest).not.toHaveBeenCalled();
  });

  it("add uses load.start with the required empty target arg first", async () => {
    await addRtorrentTorrent("magnet:?xt=urn:btih:abc");
    const body = lastBody();
    expect(body).toContain("<methodName>load.start</methodName>");
    // First param is the empty-string target placeholder, then the magnet.
    expect(body).toContain(
      "<params><param><value><string></string></value></param>",
    );
    expect(body).toContain("magnet:?xt=urn:btih:abc");
  });

  it("add sanitizes savePath/label so a quote can't break out of the command", async () => {
    await addRtorrentTorrent("magnet:?xt=urn:btih:abc", {
      savePath: '/data/m"v',
      label: "lab\nel",
    });
    const body = lastBody();
    // Quote stripped → the d.directory.set="…" literal stays balanced.
    expect(body).toContain('d.directory.set="/data/mv"');
    expect(body).not.toContain('m"v');
    // Newline stripped from the label.
    expect(body).toContain("d.custom1.set=label");
  });

  it("set-limits sends KiB set_kb setters as i8", async () => {
    await setRtorrentGlobalLimits({ dlKib: 5120, upKib: 1024 });
    const body = lastBody();
    expect(body).toContain("throttle.global_down.max_rate.set_kb");
    expect(body).toContain("throttle.global_up.max_rate.set_kb");
    expect(body).toContain("<i8>5120</i8>");
    expect(body).toContain("<i8>1024</i8>");
  });
});

describe("getRtorrentGlobalStats fault tolerance", () => {
  it("treats a faulting sub-call as 0 and keeps the rest", async () => {
    const arr = (inner: string) =>
      `<value><array><data>${inner}</data></array></value>`;
    const faultStruct =
      "<value><struct>" +
      "<member><name>faultCode</name><value><i4>-506</i4></value></member>" +
      "<member><name>faultString</name><value><string>Method not defined</string></value></member>" +
      "</struct></value>";
    // Order matches getRtorrentGlobalStats: down.rate, up.rate, down.total,
    // up.total, down.max_rate (FAULTED), up.max_rate.
    const xml =
      '<?xml version="1.0"?><methodResponse><params><param><value><array><data>' +
      arr("<value><i4>1000</i4></value>") +
      arr("<value><i4>2000</i4></value>") +
      arr("<value><i8>500000</i8></value>") +
      arr("<value><i8>600000</i8></value>") +
      faultStruct +
      arr("<value><i4>0</i4></value>") +
      "</data></array></value></param></params></methodResponse>";
    mockServiceRequest.mockResolvedValue(xml as never);

    const stats = await getRtorrentGlobalStats();
    expect(stats.dlSpeed).toBe(1000);
    expect(stats.upSpeed).toBe(2000);
    expect(stats.dlTotalLifetime).toBe(500000);
    expect(stats.upTotalLifetime).toBe(600000);
    // The faulting down.max_rate sub-call degrades to 0 rather than NaN/throw.
    expect(stats.dlLimit).toBe(0);
    expect(stats.upLimit).toBe(0);
  });
});
