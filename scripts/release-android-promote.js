#!/usr/bin/env node
/**
 * Publishes the Android build that `pnpm release:android` left on Play's internal
 * track (release-android-play.js uploads it there as a draft) to production, with
 * release notes.
 *
 * Shows what production has now and its notes, asks for the new notes, prints
 * exactly what will change and asks before touching Play. Both tracks change in
 * a single edit, so a failure leaves Play as it was.
 *
 * Usage:
 *   pnpm release:android:promote
 *   pnpm release:android:promote --notes-file notes.txt --yes   # unattended
 *   pnpm release:android:promote --dry-run                      # plan only
 *
 * Auth: the Play service account in scripts/play-api.js (./play-service-account.json).
 */

const { FLAGS_HELP, parseFlags, indent, getNotes, confirm } = require("./release-prompts");
const { PACKAGE_NAME, authenticate, api, withEdit } = require("./play-api");

const pkg = require("../package.json");
const VERSION = pkg.version;

// Play rejects release notes longer than this (per language).
const NOTES_LIMIT = 500;

function log(msg) {
  console.log(`[release-android] ${msg}`);
}

function die(msg, hint) {
  console.error(`\n[release-android] ERROR: ${msg}`);
  if (hint) console.error(`[release-android] ${hint}`);
  process.exit(1);
}

async function readTracks() {
  return withEdit(async (id) => {
    const { defaultLanguage } = await api("GET", `/edits/${id}/details`);
    const { tracks = [] } = await api("GET", `/edits/${id}/tracks`);
    const releases = (name) => tracks.find((t) => t.track === name)?.releases ?? [];
    return { language: defaultLanguage, production: releases("production"), internal: releases("internal") };
  });
}

function describe(release) {
  const rollout = release.userFraction ? ` at ${Math.round(release.userFraction * 100)}%` : "";
  return `${release.name} (versionCode ${release.versionCodes?.join(", ")}, ${release.status}${rollout})`;
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  if (flags.help) {
    console.log(
      `Usage: pnpm release:android:promote [flags]\n\n` +
        `Publishes ${PACKAGE_NAME} ${VERSION} from Play's internal track to production.\n\n${FLAGS_HELP}`
    );
    return;
  }
  await authenticate();
  const { language, production, internal } = await readTracks();
  if (production.some((r) => r.name === VERSION && r.status === "completed")) {
    log(`${VERSION} is already in production. Nothing to do.`);
    return;
  }
  const target = internal.find((r) => r.name === VERSION);
  if (!target) {
    die(`No ${VERSION} build on Play's internal track.`, "Run pnpm release:android first; it uploads the bundle there as a draft.");
  }
  const live = production.find((r) => r.status === "completed") ?? production[0];

  log(`Ready to publish ${VERSION} (versionCode ${target.versionCodes.join(", ")}) to production.`);
  log(`Production now: ${live ? describe(live) : "nothing"}`);
  const previousNotes = live?.releaseNotes?.find((n) => n.language === language)?.text;
  const notes = await getNotes(flags, { limit: NOTES_LIMIT, previous: previousNotes });

  console.log(`\nPlan for Google Play (${PACKAGE_NAME}):`);
  console.log(`  - Production: ${live ? `${live.name} -> ` : ""}${VERSION}, full rollout`);
  if (target.status !== "completed") console.log(`  - Internal testing: ${VERSION} ${target.status} -> completed`);
  console.log(
    notes
      ? `  - Release notes (${language}, ${notes.length}/${NOTES_LIMIT} characters):\n${indent(notes, "      ")}`
      : "  - Release notes: not given"
  );
  console.log("  Google reviews the release before it reaches users.");

  if (flags.dryRun) {
    log("Dry run, nothing was changed.");
    return;
  }
  await confirm(flags);

  const release = {
    name: VERSION,
    versionCodes: target.versionCodes,
    status: "completed",
    releaseNotes: [{ language, text: notes }],
  };
  // The notes prompt can outlive the first token, so take a fresh one for the write.
  await authenticate();
  await withEdit(
    async (id) => {
      await api("PUT", `/edits/${id}/tracks/internal`, { track: "internal", releases: [release] });
      await api("PUT", `/edits/${id}/tracks/production`, { track: "production", releases: [release] });
    },
    { commit: true }
  );

  const after = await readTracks();
  const published = after.production.find((r) => r.name === VERSION);
  log(`Done. Production: ${published ? describe(published) : "not found, check the Play Console"}`);
}

main().catch((e) => die(e.message, e.hint));
