import { test } from "node:test";
import assert from "node:assert/strict";

import { extractSessionCookie, interpretLoginResponse } from "./qbittorrent.js";

// The real Set-Cookie a qBittorrent 5.2.x instance returned (issue #246).
const QBT_5_2 =
  "QBT_SID_8080=fDLLe+7+1AxYgftpduTLJIgE51T4ioYW; HttpOnly; SameSite=Lax; expires=Fri, 26-Jun-2026 19:46:32 GMT; path=/";
const QBT_5_2_PAIR = "QBT_SID_8080=fDLLe+7+1AxYgftpduTLJIgE51T4ioYW";
const AUTH_BYPASS_SENTINEL = "__qbt_no_cookie__";

test("extractSessionCookie: 5.2.0+ QBT_SID_<port> returns the full name=value", () => {
  assert.equal(extractSessionCookie([QBT_5_2]), QBT_5_2_PAIR);
});

test("extractSessionCookie: legacy SID cookie", () => {
  assert.equal(extractSessionCookie(["SID=abc123; HttpOnly; path=/"]), "SID=abc123");
});

test("extractSessionCookie: preserves +, / and = padding in the value", () => {
  assert.equal(extractSessionCookie(["QBT_SID_9090=aB+c/d=; path=/"]), "QBT_SID_9090=aB+c/d=");
});

test("extractSessionCookie: ignores non-session cookies (no JSESSIONID false positive)", () => {
  assert.equal(extractSessionCookie(["JSESSIONID=xyz; path=/"]), null);
  assert.equal(extractSessionCookie(["XSRF-TOKEN=abc"]), null);
});

test("extractSessionCookie: order-independent when a proxy cookie comes first", () => {
  assert.equal(extractSessionCookie(["XSRF-TOKEN=proxy; path=/", QBT_5_2]), QBT_5_2_PAIR);
});

test("extractSessionCookie: empty list -> null", () => {
  assert.equal(extractSessionCookie([]), null);
});

test("interpretLoginResponse: 204 + cookie -> ok(pair)", () => {
  assert.deepEqual(interpretLoginResponse(204, "", [QBT_5_2]), {
    kind: "ok",
    cookie: QBT_5_2_PAIR,
  });
});

test("interpretLoginResponse: 204 + no cookie -> ok(bypass sentinel)", () => {
  assert.deepEqual(interpretLoginResponse(204, "", []), {
    kind: "ok",
    cookie: AUTH_BYPASS_SENTINEL,
  });
});

test("interpretLoginResponse: 200 'Ok.' + cookie -> ok(pair) (legacy)", () => {
  assert.deepEqual(interpretLoginResponse(200, "Ok.", ["SID=abc; path=/"]), {
    kind: "ok",
    cookie: "SID=abc",
  });
});

test("interpretLoginResponse: 200 'Ok.' + no cookie -> ok(bypass sentinel)", () => {
  assert.deepEqual(interpretLoginResponse(200, "Ok.", []), {
    kind: "ok",
    cookie: AUTH_BYPASS_SENTINEL,
  });
});

test("interpretLoginResponse: 200 'Fails.' -> rejected", () => {
  assert.deepEqual(interpretLoginResponse(200, "Fails.", []), { kind: "rejected" });
});

test("interpretLoginResponse: auth-proxy HTML login page (no cookie) -> rejected", () => {
  assert.deepEqual(interpretLoginResponse(200, "<html>login</html>", []), { kind: "rejected" });
});

test("interpretLoginResponse: unexpected body but valid cookie -> ok (cookie authoritative)", () => {
  assert.deepEqual(interpretLoginResponse(200, "weird", [QBT_5_2]), {
    kind: "ok",
    cookie: QBT_5_2_PAIR,
  });
});
