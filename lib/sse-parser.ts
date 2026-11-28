/**
 * Incremental Server-Sent Events parser (WHATWG event-stream rules, the
 * subset PocketBase realtime uses). Fed raw text in whatever chunks the
 * network delivers, so a field can be split anywhere — even between the
 * `\r` and `\n` of a CRLF.
 */
export interface SseEvent {
  event: string;
  data: string;
  id?: string;
}

export function createSseParser(onEvent: (e: SseEvent) => void): { push(chunk: string): void } {
  let buffer = "";
  let event = "";
  let data: string[] = [];
  let id: string | undefined;

  function line(l: string) {
    if (l === "") {
      if (data.length) {
        const e: SseEvent = { event: event || "message", data: data.join("\n") };
        if (id !== undefined) e.id = id;
        onEvent(e);
      }
      event = "";
      data = [];
      return;
    }
    if (l.startsWith(":")) return;
    const colon = l.indexOf(":");
    const field = colon === -1 ? l : l.slice(0, colon);
    let value = colon === -1 ? "" : l.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
    else if (field === "id") id = value;
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (c !== "\n" && c !== "\r") continue;
        // A trailing \r may be the first half of a CRLF still in flight.
        if (c === "\r" && i === buffer.length - 1) break;
        line(buffer.slice(start, i));
        if (c === "\r" && buffer[i + 1] === "\n") i++;
        start = i + 1;
      }
      buffer = buffer.slice(start);
    },
  };
}
