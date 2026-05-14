#!/usr/bin/env node
/**
 * Local end-to-end iOS release: prebuild → archive → export IPA → upload to App Store Connect.
 * Mirrors `release-android-apk.js` in spirit; replaces a Codemagic / EAS Build pipeline.
 *
 * After upload, the build appears in App Store Connect under TestFlight within a few minutes.
 * Promoting to TestFlight beta or submitting for App Store review is done from the App Store
 * Connect UI — by design, so this script is non-destructive and stops short of "ship to users".
 *
 * Prereqs (one-time):
 *   - Xcode 15+ with your Apple ID added (Xcode → Settings → Accounts) and your Team selected.
 *   - App Store Connect API key (App Manager role) saved at
 *       ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8
 *   - Apple Developer Program membership (paid).
 *
 * First run prompts for the Issuer ID + Team ID and stores them at
 *   ~/.config/dashboarr/ios-release.json
 * so subsequent runs are zero-interaction.
 *
 * Usage:
 *   pnpm bump:patch        # bump version (commits + tags)
 *   pnpm release:ios       # builds + uploads
 *
 * Flags:
 *   --no-upload   Stop after IPA export (useful for testing the build pipeline).
 *   --skip-prebuild  Reuse existing ios/ folder (faster iteration when debugging).
 */

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const os = require("os");
const readline = require("readline");

const pkg = require("../package.json");
const VERSION = pkg.version;

const ROOT = path.resolve(__dirname, "..");
const BUILD_DIR = path.join(ROOT, "ios", "build");
const ARCHIVE_PATH = path.join(BUILD_DIR, "Dashboarr.xcarchive");
const IPA_DIR = path.join(BUILD_DIR, "ipa");
const EXPORT_OPTIONS_PATH = path.join(BUILD_DIR, "exportOptions.plist");

const KEYS_DIR = path.join(os.homedir(), ".appstoreconnect", "private_keys");
const CONFIG_DIR = path.join(os.homedir(), ".config", "dashboarr");
const CONFIG_PATH = path.join(CONFIG_DIR, "ios-release.json");

const FLAGS = {
  noUpload: process.argv.includes("--no-upload"),
  skipPrebuild: process.argv.includes("--skip-prebuild"),
};

function log(msg) {
  console.log(`[release-ios] ${msg}`);
}

function die(msg, hint) {
  console.error(`\n[release-ios] ERROR: ${msg}`);
  if (hint) console.error(`[release-ios] ${hint}`);
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n$ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, ...opts });
  if (r.status !== 0) {
    die(`Command failed: ${cmd} (exit ${r.status})`);
  }
}

function capture(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
  return {
    status: r.status,
    stdout: (r.stdout?.toString() ?? "").trim(),
    stderr: (r.stderr?.toString() ?? "").trim(),
  };
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a.trim()); }));
}

function findKeyId() {
  if (!fs.existsSync(KEYS_DIR)) return null;
  const files = fs.readdirSync(KEYS_DIR).filter((f) => /^AuthKey_(.+)\.p8$/.test(f));
  if (files.length === 0) return null;
  if (files.length > 1) {
    log(`Found ${files.length} AuthKey_*.p8 files in ${KEYS_DIR}; using ${files[0]}.`);
    log(`If that's wrong, edit ${CONFIG_PATH} → "keyId" field.`);
  }
  return files[0].match(/^AuthKey_(.+)\.p8$/)[1];
}

function findTeamIdFromKeychain() {
  // Apple Distribution cert is preferred (Team ID in parens). Fall back to Apple Development
  // for personal/team-of-one accounts where the parenthesized value is also the Team ID.
  const r = capture("security", ["find-identity", "-p", "codesigning", "-v"]);
  if (r.status !== 0) return null;
  const dist = r.stdout.match(/Apple Distribution[^(]*\(([A-Z0-9]{10})\)/);
  if (dist) return dist[1];
  const dev = r.stdout.match(/Apple Development[^(]*\(([A-Z0-9]{10})\)/);
  return dev ? dev[1] : null;
}

async function loadConfig() {
  let cfg = {};
  if (fs.existsSync(CONFIG_PATH)) {
    try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8")); }
    catch (e) { die(`Failed to parse ${CONFIG_PATH}: ${e.message}`, "Delete the file to recreate it."); }
  }

  const keyId = cfg.keyId || findKeyId();
  if (!keyId) {
    die(
      `No AuthKey_*.p8 found in ${KEYS_DIR}.`,
      "Download an App Store Connect API key (App Manager role) from\n" +
      "  https://appstoreconnect.apple.com/access/integrations/api\n" +
      `and place it at ${KEYS_DIR}/AuthKey_<KEY_ID>.p8`
    );
  }

  let issuerId = cfg.issuerId;
  if (!issuerId) {
    console.log("\nApp Store Connect Issuer ID not configured.");
    console.log("Find it at: https://appstoreconnect.apple.com/access/integrations/api");
    console.log("It's at the top of the Keys page — looks like a UUID, e.g. 69a6de8a-1234-...\n");
    issuerId = await prompt("Issuer ID: ");
    if (!issuerId) die("Issuer ID is required.");
  }

  let teamId = cfg.teamId || findTeamIdFromKeychain();
  if (!teamId) {
    console.log("\nApple Team ID not detected from keychain.");
    console.log("Find it at: https://developer.apple.com/account → Membership → Team ID");
    console.log("Format: 10 alphanumeric characters, e.g. AB12CD34EF\n");
    teamId = await prompt("Team ID: ");
    if (!teamId) die("Team ID is required.");
  }

  const next = { keyId, issuerId, teamId };
  if (JSON.stringify(next) !== JSON.stringify(cfg)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2) + "\n", { mode: 0o600 });
    log(`Saved config → ${CONFIG_PATH}`);
  }

  return next;
}

function writeExportOptions(teamId) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  // Xcode 15+ uses "app-store-connect" (formerly "app-store"). signingStyle=automatic lets
  // Xcode fetch/create a Distribution profile via the team ID, provided the Apple ID is
  // signed in under Xcode → Settings → Accounts.
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>method</key>
    <string>app-store-connect</string>
    <key>teamID</key>
    <string>${teamId}</string>
    <key>destination</key>
    <string>export</string>
    <key>signingStyle</key>
    <string>automatic</string>
    <key>uploadSymbols</key>
    <true/>
    <key>stripSwiftSymbols</key>
    <true/>
</dict>
</plist>
`;
  fs.writeFileSync(EXPORT_OPTIONS_PATH, plist);
}

async function main() {
  const cfg = await loadConfig();

  log(`Dashboarr v${VERSION} → App Store Connect`);
  log(`Key ID:    ${cfg.keyId}`);
  log(`Issuer ID: ${cfg.issuerId}`);
  log(`Team ID:   ${cfg.teamId}`);
  if (FLAGS.noUpload) log("--no-upload set: will stop after IPA export.");
  if (FLAGS.skipPrebuild) log("--skip-prebuild set: reusing existing ios/ folder.");

  // 1. Prebuild — regenerates ios/ from app.config.ts so ios.buildNumber reflects pkg.version.
  if (!FLAGS.skipPrebuild) {
    log("\nStep 1/4: prebuild");
    run("pnpm", ["prebuild", "--platform", "ios", "--clean"]);
  } else {
    log("\nStep 1/4: skipped (--skip-prebuild)");
  }

  // 2. Archive — Release config, generic iOS device.
  log("\nStep 2/4: archive");
  if (fs.existsSync(ARCHIVE_PATH)) {
    fs.rmSync(ARCHIVE_PATH, { recursive: true, force: true });
  }
  run("xcodebuild", [
    "-workspace", "ios/Dashboarr.xcworkspace",
    "-scheme", "Dashboarr",
    "-configuration", "Release",
    "-sdk", "iphoneos",
    "-destination", "generic/platform=iOS",
    "-archivePath", ARCHIVE_PATH,
    "archive",
  ]);

  // 3. Export IPA from the archive.
  log("\nStep 3/4: export ipa");
  writeExportOptions(cfg.teamId);
  if (fs.existsSync(IPA_DIR)) {
    fs.rmSync(IPA_DIR, { recursive: true, force: true });
  }
  run("xcodebuild", [
    "-exportArchive",
    "-archivePath", ARCHIVE_PATH,
    "-exportPath", IPA_DIR,
    "-exportOptionsPlist", EXPORT_OPTIONS_PATH,
  ]);

  const ipaFiles = fs.readdirSync(IPA_DIR).filter((f) => f.endsWith(".ipa"));
  if (ipaFiles.length === 0) {
    die("Export produced no .ipa file. Check the xcodebuild output above.");
  }
  const ipaPath = path.join(IPA_DIR, ipaFiles[0]);
  log(`Exported: ${ipaPath} (${(fs.statSync(ipaPath).size / 1024 / 1024).toFixed(1)} MB)`);

  if (FLAGS.noUpload) {
    log("\nStopping before upload (--no-upload).");
    log(`IPA ready at: ${ipaPath}`);
    return;
  }

  // 4. Upload to App Store Connect via altool. The .p8 is auto-discovered in
  // ~/.appstoreconnect/private_keys/AuthKey_<KEY_ID>.p8 — no path argument exists.
  log("\nStep 4/4: upload to App Store Connect");
  run("xcrun", [
    "altool",
    "--upload-app",
    "--type", "ios",
    "--file", ipaPath,
    "--apiKey", cfg.keyId,
    "--apiIssuer", cfg.issuerId,
  ]);

  log("\n✓ Upload complete.");
  log("Build will appear in App Store Connect → TestFlight within a few minutes.");
  log("https://appstoreconnect.apple.com/apps");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
