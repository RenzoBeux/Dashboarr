import { test } from "node:test";
import assert from "node:assert/strict";

import { sendApprise } from "./apprise.js";

const realFetch = globalThis.fetch;

/** Stub globalThis.fetch, capturing the call, and return the given status. */
function stubFetch(status: number) {
  const calls: { url: string; init: RequestInit }[] = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return {
      status,
      text: async () => "",
    } as Response;
  }) as typeof fetch;
  return calls;
}

test("sendApprise: no-op when url is empty (no fetch)", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return { status: 200, text: async () => "" } as Response;
  }) as typeof fetch;
  try {
    await sendApprise({ url: "", tags: "" }, { title: "t", body: "b" });
    assert.equal(called, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendApprise: 200 resolves and posts the expected body (no tag when blank)", async () => {
  const calls = stubFetch(200);
  try {
    await sendApprise(
      { url: "http://host:8000/notify/key", tags: "" },
      { title: "Done", body: "All set" },
    );
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://host:8000/notify/key");
    assert.equal(calls[0].init.method, "POST");
    const body = JSON.parse(calls[0].init.body as string);
    assert.deepEqual(body, {
      title: "Done",
      body: "All set",
      type: "info",
      format: "text",
    });
    assert.equal("tag" in body, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendApprise: includes trimmed tag when provided", async () => {
  const calls = stubFetch(200);
  try {
    await sendApprise(
      { url: "http://host:8000/notify/key", tags: "  phone,important  " },
      { title: "t", body: "b" },
    );
    const body = JSON.parse(calls[0].init.body as string);
    assert.equal(body.tag, "phone,important");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendApprise: 204 throws a 'no config under that key' error", async () => {
  stubFetch(204);
  try {
    await assert.rejects(
      sendApprise({ url: "http://host:8000/notify/key", tags: "" }, { title: "t", body: "b" }),
      /204/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendApprise: 424 throws a delivery/tag-mismatch error", async () => {
  stubFetch(424);
  try {
    await assert.rejects(
      sendApprise({ url: "http://host:8000/notify/key", tags: "" }, { title: "t", body: "b" }),
      /424/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("sendApprise: other non-200 throws with the raw status", async () => {
  stubFetch(500);
  try {
    await assert.rejects(
      sendApprise({ url: "http://host:8000/notify/key", tags: "" }, { title: "t", body: "b" }),
      /HTTP 500/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
