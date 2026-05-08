#!/usr/bin/env node
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const pkg = require('../package.json');
const version = pkg.version;
const tag = `v${version}`;
const FORCE = process.argv.includes('--force');
const apkPath = path.join(
  __dirname,
  '..',
  'android',
  'app',
  'build',
  'outputs',
  'apk',
  'release',
  'app-release.apk'
);

function quote(arg) {
  return `"${String(arg).replace(/"/g, '\\"')}"`;
}

function run(cmd, args) {
  const line = [cmd, ...args.map(quote)].join(' ');
  const result = spawnSync(line, { stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(cmd, args) {
  const line = [cmd, ...args.map(quote)].join(' ');
  const result = spawnSync(line, { stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  return { status: result.status, stdout: result.stdout?.toString() ?? '', stderr: result.stderr?.toString() ?? '' };
}

if (!fs.existsSync(apkPath)) {
  console.error(`[release] APK not found at ${apkPath}`);
  console.error('[release] Run "pnpm build:android:prod" first.');
  process.exit(1);
}

const ghCheck = capture('gh', ['--version']);
if (ghCheck.status !== 0) {
  console.error('[release] GitHub CLI ("gh") is required. Install from https://cli.github.com/');
  process.exit(1);
}

console.log(`[release] Target tag: ${tag}`);
console.log(`[release] APK:        ${apkPath}`);

const releaseView = capture('gh', ['release', 'view', tag]);
if (releaseView.status !== 0) {
  console.log(`[release] Release ${tag} not found, creating...`);
  run('gh', ['release', 'create', tag, '--title', tag, '--generate-notes']);
} else if (FORCE) {
  console.log(`[release] Release ${tag} already exists, --force passed, overwriting APK asset.`);
} else {
  console.error(`[release] Release ${tag} already exists.`);
  console.error(`[release] Refusing to overwrite the APK asset — did you forget to bump the version in package.json?`);
  console.error(`[release] Run "pnpm bump:patch" (or :minor / :major) and retry, or pass --force to overwrite intentionally.`);
  process.exit(1);
}

console.log(`[release] Uploading APK...`);
run('gh', ['release', 'upload', tag, apkPath, '--clobber']);

console.log(`[release] Done. https://github.com/renzobeux/Dashboarr/releases/tag/${tag}`);
