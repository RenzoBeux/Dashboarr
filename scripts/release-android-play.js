#!/usr/bin/env node
/**
 * Uploads the locally built AAB to Play's internal track as a draft, straight
 * through the Play Developer API. `pnpm release:android:promote` then publishes
 * it to production with the release notes.
 *
 * Safe to re-run: a bundle Play already has (same SHA-256) is not uploaded
 * again, and a version already on the internal track is left alone. The upload
 * and the track change commit as one edit, so a failure leaves Play as it was.
 *
 * Usage:
 *   pnpm release:android:play
 *   pnpm release:android:play --dry-run   # check the bundle and Play, upload nothing
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { ReleaseError } = require("./release-prompts");
const { authenticate, api, uploadFile, withEdit } = require("./play-api");

const pkg = require("../package.json");
const VERSION = pkg.version;

// Same derivation as app.config.ts, which stamps it into the build: 1.2.3 -> 10203.
const [major, minor, patch] = VERSION.split(".").map((n) => parseInt(n, 10));
const VERSION_CODE = major * 10000 + minor * 100 + patch;

const AAB_PATH = path.join(__dirname, "..", "android", "app", "build", "outputs", "bundle", "release", "app-release.aab");

function log(msg) {
  console.log(`[release-android] ${msg}`);
}

function die(msg, hint) {
  console.error(`\n[release-android] ERROR: ${msg}`);
  if (hint) console.error(`[release-android] ${hint}`);
  process.exit(1);
}

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    fs.createReadStream(filePath)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}

// Throws rather than exiting, so withEdit still deletes the edit (and a stale upload with it).
function checkVersionCode(versionCode) {
  if (Number(versionCode) !== VERSION_CODE) {
    throw new ReleaseError(
      `The AAB is versionCode ${versionCode}, but package.json ${VERSION} needs ${VERSION_CODE}.`,
      "Run pnpm build:android:prod to rebuild it."
    );
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    console.log(
      `Usage: pnpm release:android:play [--dry-run]\n\n` +
        `Uploads ${path.relative(process.cwd(), AAB_PATH)} (${VERSION}) to Play's internal track as a draft.`
    );
    return;
  }
  const unknown = args.filter((a) => a !== "--dry-run");
  if (unknown.length) die(`Unknown flag: ${unknown[0]}`, "Run with --help to see the flags.");
  const dryRun = args.includes("--dry-run");

  if (!fs.existsSync(AAB_PATH)) die(`AAB not found at ${AAB_PATH}.`, "Run pnpm build:android:prod first.");
  const size = fs.statSync(AAB_PATH).size;
  const hash = await sha256(AAB_PATH);
  log(`AAB: ${(size / 1024 / 1024).toFixed(1)} MB, sha256 ${hash.slice(0, 12)}`);

  await authenticate();
  // Committed only when the internal track actually changes; otherwise withEdit
  // deletes the edit, discarding an upload along with it.
  const changed = await withEdit(
    async (id) => {
      const { bundles = [] } = await api("GET", `/edits/${id}/bundles`);
      const known = bundles.find((b) => b.sha256 === hash);
      if (known) checkVersionCode(known.versionCode);

      const { releases = [] } = await api("GET", `/edits/${id}/tracks/internal`);
      const onTrack = releases.find((r) => r.versionCodes?.includes(String(VERSION_CODE)));
      if (onTrack) {
        log(`${VERSION} (versionCode ${VERSION_CODE}) is already on the internal track (${onTrack.status}). Nothing to do.`);
        return false;
      }
      if (dryRun) {
        log(known ? `Play already has this bundle (versionCode ${known.versionCode}); it would only add the draft.` : "Would upload the bundle.");
        log(`Would add ${VERSION} (versionCode ${VERSION_CODE}) to the internal track as a draft.`);
        log("Dry run, nothing was changed.");
        return false;
      }

      let versionCode = known?.versionCode;
      if (!known) {
        log("Uploading the bundle (Play processes it before answering, this takes a minute or two)...");
        ({ versionCode } = await uploadFile(`/edits/${id}/bundles?uploadType=media`, AAB_PATH));
        checkVersionCode(versionCode);
        log(`Uploaded, versionCode ${versionCode}.`);
      }
      await api("PUT", `/edits/${id}/tracks/internal`, {
        track: "internal",
        releases: [{ name: VERSION, versionCodes: [String(versionCode)], status: "draft" }],
      });
      return true;
    },
    { commit: (didChange) => didChange }
  );

  if (changed) log(`Done. ${VERSION} is a draft on the internal track; publish it with pnpm release:android:promote.`);
}

main().catch((e) => die(e.message, e.hint));
