import { test } from "node:test";
import assert from "node:assert/strict";
import { createUiSessionStore } from "./ui-session.js";

test("create returns a 64-char hex token that the store recognises", () => {
  const store = createUiSessionStore();
  const token = store.create();
  assert.match(token, /^[0-9a-f]{64}$/);
  assert.equal(store.has(token), true);
});

test("unknown and revoked tokens are rejected", () => {
  const store = createUiSessionStore();
  const token = store.create();
  assert.equal(store.has("not-a-token"), false);
  store.revoke(token);
  assert.equal(store.has(token), false);
});

test("tokens expire after the ttl", () => {
  const store = createUiSessionStore(1000);
  const token = store.create(10_000);
  assert.equal(store.has(token, 10_999), true);
  assert.equal(store.has(token, 11_000), false);
  // Expired entries are dropped, not just hidden.
  assert.equal(store.has(token, 10_500), false);
});

test("every token is distinct", () => {
  const store = createUiSessionStore();
  const a = store.create();
  const b = store.create();
  assert.notEqual(a, b);
});
