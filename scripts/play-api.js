/**
 * Google Play Developer API client shared by release-android-play.js (bundle
 * upload) and release-android-promote.js (internal -> production). Plain fetch +
 * crypto, so the scripts need no Google SDK.
 *
 * Auth: the service account key at ./play-service-account.json (gitignored).
 */

const fs = require("fs");
const https = require("https");
const path = require("path");
const crypto = require("crypto");
const { ReleaseError } = require("./release-prompts");

const PACKAGE_NAME = "com.dashboarr.app";
const SERVICE_ACCOUNT_PATH = path.join(__dirname, "..", "play-service-account.json");
const API = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE_NAME}`;
const UPLOAD_API = `https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications/${PACKAGE_NAME}`;

const b64url = (data) => Buffer.from(data).toString("base64url");

let accessToken = null;

// Service-account OAuth: a JWT signed with the account's key, exchanged for an
// access token.
async function authenticate() {
  if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    throw new ReleaseError(
      `Play service account not found at ${SERVICE_ACCOUNT_PATH}.`,
      "Download the key of the Play Console service account (API access) to that path."
    );
  }
  const account = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/androidpublisher",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), account.private_key);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${b64url(signature)}`,
    }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new ReleaseError(`Google rejected the service account (${res.status} ${json.error ?? ""}).`, `Check ${SERVICE_ACCOUNT_PATH}.`);
  }
  accessToken = json.access_token;
}

async function api(method, route, body) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: { authorization: `Bearer ${accessToken}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new ReleaseError(`${method} ${route} failed (${res.status}): ${text.slice(0, 600)}`);
  return text ? JSON.parse(text) : {};
}

// Streams a file to an upload endpoint. Not fetch: Play processes the bundle
// before it answers, which can outlast undici's 5-minute header timeout, and
// fetch would also buffer the whole file in memory.
function uploadFile(route, filePath) {
  const size = fs.statSync(filePath).size;
  return new Promise((resolve, reject) => {
    const req = https.request(
      `${UPLOAD_API}${route}`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${accessToken}`,
          "content-type": "application/octet-stream",
          "content-length": size,
        },
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (text += chunk));
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(text ? JSON.parse(text) : {});
          else reject(new ReleaseError(`Upload to ${route} failed (${res.statusCode}): ${text.slice(0, 600)}`));
        });
        res.on("error", reject);
      }
    );
    req.on("error", reject);
    fs.createReadStream(filePath).on("error", reject).pipe(req);
  });
}

// Play changes go through an "edit", a draft of the whole app listing. Reads use
// a throwaway edit and writes commit theirs; an uncommitted edit is always deleted.
// `commit` can also be a function of fn's result, to commit only when fn changed something.
async function withEdit(fn, { commit = false } = {}) {
  const { id } = await api("POST", "/edits", {});
  let committed = false;
  try {
    const result = await fn(id);
    if (typeof commit === "function" ? commit(result) : commit) {
      await api("POST", `/edits/${id}:commit`);
      committed = true;
    }
    return result;
  } finally {
    if (!committed) await api("DELETE", `/edits/${id}`).catch(() => {});
  }
}

module.exports = { PACKAGE_NAME, authenticate, api, uploadFile, withEdit };
