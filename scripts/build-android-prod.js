#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');
const IS_WINDOWS = process.platform === 'win32';
const NPX = IS_WINDOWS ? 'npx.cmd' : 'npx';
const GRADLEW = IS_WINDOWS ? 'gradlew.bat' : './gradlew';

const KEYSTORE_SRC = path.join(os.homedir(), '.android-keystores', 'dashboarr-release.keystore');
const KEYSTORE_DST = path.join(ANDROID_DIR, 'app', 'dashboarr-release.keystore');

function run(cmd, args, opts = {}) {
  console.log(`[build] $ ${cmd} ${args.join(' ')}${opts.cwd ? `  (in ${path.relative(ROOT, opts.cwd) || '.'})` : ''}`);
  const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false, ...opts });
  if (result.status !== 0) {
    console.error(`[build] Command failed: ${cmd} ${args.join(' ')}`);
    process.exit(result.status ?? 1);
  }
}

run(NPX, ['expo', 'prebuild', '--platform', 'android', '--clean'], { cwd: ROOT });

if (!fs.existsSync(KEYSTORE_SRC)) {
  console.error(`[build] Keystore not found at ${KEYSTORE_SRC}`);
  console.error('[build] Place your release keystore there or update scripts/build-android-prod.js');
  process.exit(1);
}
fs.copyFileSync(KEYSTORE_SRC, KEYSTORE_DST);
console.log(`[build] Copied keystore -> ${path.relative(ROOT, KEYSTORE_DST)}`);

run(GRADLEW, ['bundleRelease', 'assembleRelease'], { cwd: ANDROID_DIR });

console.log('[build] Done.');
console.log(`[build] APK: ${path.join('android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk')}`);
console.log(`[build] AAB: ${path.join('android', 'app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab')}`);
