import { createSseParser, type SseEvent } from "@/lib/sse-parser";

function collect() {
  const events: SseEvent[] = [];
  const parser = createSseParser((e) => events.push(e));
  return { events, push: parser.push };
}

describe("createSseParser", () => {
  it("dispatches two events from one chunk", () => {
    const { events, push } = collect();
    push("event: a\ndata: 1\n\nevent: b\ndata: 2\n\n");
    expect(events).toEqual([
      { event: "a", data: "1" },
      { event: "b", data: "2" },
    ]);
  });

  it("reassembles an event split mid-field across chunks", () => {
    const { events, push } = collect();
    push("event: rt_met");
    push("rics\nda");
    expect(events).toEqual([]);
    push('ta: {"x":1}\n\n');
    expect(events).toEqual([{ event: "rt_metrics", data: '{"x":1}' }]);
  });

  it("accepts CRLF line endings, including split between \\r and \\n", () => {
    const { events, push } = collect();
    push("data: hi\r");
    push("\n\r\n");
    expect(events).toEqual([{ event: "message", data: "hi" }]);
  });

  it("joins multi-line data with newlines and ignores comments", () => {
    const { events, push } = collect();
    push(": keepalive\ndata: one\ndata: two\n\n");
    expect(events).toEqual([{ event: "message", data: "one\ntwo" }]);
  });

  it("carries the id field (PB_CONNECT's clientId)", () => {
    const { events, push } = collect();
    push('id: client-1\nevent: PB_CONNECT\ndata: {"clientId":"client-1"}\n\n');
    expect(events).toEqual([{ event: "PB_CONNECT", data: '{"clientId":"client-1"}', id: "client-1" }]);
  });

  it("does not dispatch a blank line with no data", () => {
    const { events, push } = collect();
    push("\n\nevent: x\n\n");
    expect(events).toEqual([]);
  });
});
