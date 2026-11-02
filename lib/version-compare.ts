/**
 * Dotted-version comparison shared by the app-update check and per-service
 * capability gates (e.g. Bazarr features that only exist from 1.6.1 on).
 *
 * Pure on purpose: lib/app-version.ts imports expo-updates, so a service
 * capability module could not pull the comparison from there.
 *
 * Tolerates the shapes services actually report: a leading "v" ("v1.6.2"),
 * and pre-release or build suffixes ("1.6.3-beta.8", "1.2.0+abc"), which are
 * dropped. A pre-release therefore compares equal to its release — right for
 * feature gates, since a feature ships in the betas leading up to a version.
 */
function parts(version: string): number[] {
  const core = version.trim().replace(/^v/i, "").split(/[-+\s]/)[0];
  return core.split(".").map((p) => parseInt(p, 10) || 0);
}

/** Negative when a < b, positive when a > b, 0 when equal. */
export function compareVersions(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da !== db) return da - db;
  }
  return 0;
}

/** True when `version` is `min` or newer. False when the version is unknown. */
export function versionAtLeast(
  version: string | null | undefined,
  min: string,
): boolean {
  if (!version) return false;
  return compareVersions(version, min) >= 0;
}
