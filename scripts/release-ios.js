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

// Bundle id is stable. Keeping it as a script constant rather than parsing
// app.config.ts keeps the script free of project-runtime deps.
const BUNDLE_ID = "com.dashboarr.app";

const PROFILE_DIRS = [
  path.join(os.homedir(), "Library", "Developer", "Xcode", "UserData", "Provisioning Profiles"),
  path.join(os.homedir(), "Library", "MobileDevice", "Provisioning Profiles"),
];

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

function findAppStoreProfile(teamId, bundleId) {
  // An App Store / Distribution profile has TeamIdentifier=teamId,
  // application-identifier=<teamId>.<bundleId>, and NO ProvisionedDevices key
  // (the absence is the canonical marker of an App Store distribution profile;
  // Development and Ad Hoc both list provisioned device UDIDs).
  const wantedAppId = `${teamId}.${bundleId}`;
  for (const dir of PROFILE_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".mobileprovision")) continue;
      const full = path.join(dir, file);
      const r = capture("security", ["cms", "-D", "-i", full]);
      if (r.status !== 0) continue;
      const xml = r.stdout;
      const team = xml.match(/<key>TeamIdentifier<\/key>\s*<array>\s*<string>([^<]+)<\/string>/);
      const appId = xml.match(/<key>application-identifier<\/key>\s*<string>([^<]+)<\/string>/);
      const name = xml.match(/<key>Name<\/key>\s*<string>([^<]+)<\/string>/);
      if (!team || !appId || !name) continue;
      if (team[1] !== teamId) continue;
      if (appId[1] !== wantedAppId) continue;
      if (/<key>ProvisionedDevices<\/key>/.test(xml)) continue;
      return { name: name[1], uuid: file.replace(/\.mobileprovision$/, ""), path: full };
    }
  }
  return null;
}

function ensureCodesignCanAccessKeys() {
  // Probe codesign on a tiny Mach-O with a real signing identity. If the keychain is
  // locked or the private keys' ACL doesn't grant `codesign` access, this fails with
  // `errSecInternalComponent` — the exact same error xcodebuild surfaces from
  // `Embed Pods Frameworks`, just five minutes earlier and with a clear hint.
  const ids = capture("security", ["find-identity", "-p", "codesigning", "-v"]);
  if (ids.status !== 0) {
    die("`security find-identity -p codesigning -v` failed.", "Is your keychain reachable?");
  }
  const m = ids.stdout.match(/([A-F0-9]{40}) "(Apple Distribution[^"]+)"/)
        || ids.stdout.match(/([A-F0-9]{40}) "(Apple Development[^"]+)"/);
  if (!m) {
    die(
      "No Apple signing identity found in the keychain.",
      "Open Xcode → Settings → Accounts and add your Apple ID, or import a .p12 into the login keychain."
    );
  }
  const [, hash, name] = m;
  const probe = path.join(os.tmpdir(), `dashboarr-codesign-probe-${Date.now()}`);
  fs.copyFileSync("/bin/echo", probe);
  try {
    const r = spawnSync("codesign", ["--force", "--sign", hash, probe], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr = (r.stderr?.toString() ?? "") + (r.stdout?.toString() ?? "");
    if (r.status === 0) {
      log(`Keychain check passed (signing test with ${name} OK).`);
      return;
    }
    if (stderr.includes("errSecInternalComponent")) {
      die(
        "codesign cannot access your signing keys (errSecInternalComponent).\n" +
        "Your login keychain is locked, or codesign isn't in the keys' partition list.",
        "One-shot unlock for this terminal session:\n" +
        "  security unlock-keychain ~/Library/Keychains/login.keychain-db\n" +
        "\n" +
        "Durable fix (grants codesign permanent access; survives reboots and timeouts):\n" +
        "  security unlock-keychain ~/Library/Keychains/login.keychain-db\n" +
        "  security set-key-partition-list -S apple-tool:,apple:,codesign: -s \\\n" +
        "    -k '<your-login-password>' ~/Library/Keychains/login.keychain-db\n" +
        "\n" +
        "Then re-run `pnpm release:ios`. Verify with:\n" +
        "  cp /bin/echo /tmp/p && codesign --force --sign \"" + name + "\" /tmp/p && echo OK"
      );
    }
    die(`codesign probe failed: ${stderr.trim() || `exit ${r.status}`}`);
  } finally {
    try { fs.unlinkSync(probe); } catch {}
  }
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

function patchPbxprojSigning(teamId, profileName) {
  // Expo's prebuild template ships with two signing settings that are wrong for
  // an App Store archive on this machine:
  //   (a) `"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer"` at project
  //       level for Release — a stale hint that biases automatic signing toward
  //       a Development cert.
  //   (b) No Dashboarr-target signing at all — so automatic signing scans the
  //       keychain and picks whichever Apple-Development identity it finds
  //       first, even from a team that has no matching profile installed
  //       (observed: cert team K3T35U7VKR paired with a profile from team
  //       67X2G875AH — works for archive, fails App Store export).
  // We fix both: strip (a) for Release only (Debug is correct as-is), and
  // inject explicit manual signing on the Dashboarr target's Release config so
  // there is no negotiation: the resolved identity is pinned to Apple
  // Distribution + the App Store profile we already have installed locally.
  // Idempotent — a re-run is a no-op once the patch is in place.
  const pbxprojPath = path.join(ROOT, "ios", "Dashboarr.xcodeproj", "project.pbxproj");
  if (!fs.existsSync(pbxprojPath)) {
    die(`Expected ${pbxprojPath} to exist after prebuild.`);
  }
  const original = fs.readFileSync(pbxprojPath, "utf8");
  let content = original;

  // (A) Strip the misleading "iPhone Developer" hint from Release configs.
  {
    let lines = content.split("\n");
    const NEEDLE = '"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "iPhone Developer"';
    const remove = new Set();
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes(NEEDLE)) continue;
      let configName = null;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].includes("isa = XCBuildConfiguration")) break;
        const m = lines[j].match(/^\s*name = (\w+);/);
        if (m) { configName = m[1]; break; }
      }
      if (configName === "Release") remove.add(i);
    }
    if (remove.size > 0) {
      content = lines.filter((_, i) => !remove.has(i)).join("\n");
    }
  }

  // (B) Inject manual signing into the Dashboarr target's Release config.
  // Match each XCBuildConfiguration block; only patch the one whose name is
  // Release AND that contains our app's PRODUCT_BUNDLE_IDENTIFIER (which is
  // only set on the target's own configs, never on project-level configs).
  const blockRe = /([0-9A-F]{24} \/\* (?:Debug|Release) \*\/ = \{\s*isa = XCBuildConfiguration;[\s\S]*?\n\t\t\tname = (\w+);\n\t\t\};)/g;
  let injections = 0;
  content = content.replace(blockRe, (block, _id, configName) => {
    if (configName !== "Release") return block;
    if (!block.includes(`PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID}`)) return block;
    if (block.includes("PROVISIONING_PROFILE_SPECIFIER")) return block;
    const inject =
      `\t\t\t\tCODE_SIGN_IDENTITY = "Apple Distribution";\n` +
      `\t\t\t\t"CODE_SIGN_IDENTITY[sdk=iphoneos*]" = "Apple Distribution";\n` +
      `\t\t\t\tCODE_SIGN_STYLE = Manual;\n` +
      `\t\t\t\tDEVELOPMENT_TEAM = ${teamId};\n` +
      `\t\t\t\tPROVISIONING_PROFILE_SPECIFIER = "${profileName}";\n`;
    injections++;
    return block.replace(/buildSettings = \{\n/, `buildSettings = {\n${inject}`);
  });

  if (content === original) {
    log("Pbxproj: signing already configured (no patch needed).");
    return;
  }
  if (injections === 0) {
    die(
      `Pbxproj patch: could not locate the Dashboarr target's Release config (looking for a block with PRODUCT_BUNDLE_IDENTIFIER = ${BUNDLE_ID}).`,
      "The Xcode project layout may have changed; this script needs updating."
    );
  }
  fs.writeFileSync(pbxprojPath, content);
  log(`Pbxproj: patched Release config → manual signing, team ${teamId}, profile "${profileName}".`);
}

function writeExportOptions(teamId, profileName) {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  // Manual signing for IPA export. The archive was signed with Apple Distribution
  // pinned to `profileName` via the pbxproj patch; tell exportArchive to use the
  // same explicitly, so it doesn't try to negotiate with Apple (it would fail
  // with "No Accounts" when no Apple ID is signed into Xcode).
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
    <string>manual</string>
    <key>signingCertificate</key>
    <string>Apple Distribution</string>
    <key>provisioningProfiles</key>
    <dict>
        <key>${BUNDLE_ID}</key>
        <string>${profileName}</string>
    </dict>
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

  // Locate the App Store profile we'll pin manual signing to. Doing this
  // up-front (before prebuild) lets us fail fast if it isn't installed.
  const profile = findAppStoreProfile(cfg.teamId, BUNDLE_ID);
  if (!profile) {
    die(
      `No App Store provisioning profile found for ${BUNDLE_ID} in team ${cfg.teamId}.`,
      "Create one at https://developer.apple.com/account/resources/profiles/list\n" +
      "  (Type: App Store, App ID: " + BUNDLE_ID + ", Cert: Apple Distribution)\n" +
      "Then in Xcode → Settings → Accounts → Manage Profiles → Download Manual Profiles,\n" +
      "or drop the .mobileprovision into\n" +
      "  ~/Library/Developer/Xcode/UserData/Provisioning Profiles/"
    );
  }
  log(`Profile:   ${profile.name} (${profile.uuid})`);

  // 0. Keychain preflight. The Embed-Pods-Frameworks phase fails with
  //   errSecInternalComponent if codesign can't reach the signing key — and that
  //   only surfaces ~5 minutes into the archive. Catch it here instead.
  log("\nStep 0/4: keychain preflight");
  ensureCodesignCanAccessKeys();

  // 1. Prebuild — regenerates ios/ from app.config.ts so ios.buildNumber reflects pkg.version.
  if (!FLAGS.skipPrebuild) {
    log("\nStep 1/4: prebuild");
    run("pnpm", ["prebuild", "--platform", "ios", "--clean"]);
  } else {
    log("\nStep 1/4: skipped (--skip-prebuild)");
  }

  // 1b. Patch the prebuild-generated pbxproj for deterministic manual signing.
  // See `patchPbxprojSigning` for the full rationale. Short version: automatic
  // signing on this setup picks the wrong identity (Apple Development from a
  // different team than the App Store profile), and pinning manual signing in
  // pbxproj is the only durable fix that survives every `expo prebuild --clean`.
  patchPbxprojSigning(cfg.teamId, profile.name);

  // 2. Archive — Release config, generic iOS device.
  // No code-signing args on the command line: the Dashboarr target's Release
  // config now carries DEVELOPMENT_TEAM, CODE_SIGN_STYLE=Manual, the Apple
  // Distribution identity, and the App Store PROVISIONING_PROFILE_SPECIFIER —
  // all injected by `patchPbxprojSigning()` above. No `-allowProvisioningUpdates`
  // either: manual signing reads the profile from disk and never contacts Apple.
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

  // 3. Export IPA from the archive — also manual signing pinned to the same
  // profile so exportArchive doesn't try (and fail) to negotiate with Apple.
  log("\nStep 3/4: export ipa");
  writeExportOptions(cfg.teamId, profile.name);
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
