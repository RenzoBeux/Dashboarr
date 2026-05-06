// Map a release quality name to a small palette so users can scan the list
// for the resolution / source they want at a glance. Returns explicit hex
// colors rather than Tailwind class names because lib/ is outside the
// tailwind.config.ts content scan — dynamic class strings here would not be
// picked up by the JIT, leading to unstyled badges.
//
// Keys match the `quality.quality.name` shape returned by Radarr / Sonarr
// (e.g. "Bluray-1080p", "WEBDL-2160p", "HDTV-720p", "DVD"). Falls back to
// neutral zinc.

export interface QualityColor {
  bg: string;
  text: string;
}

const ZINC: QualityColor = { bg: "#3f3f46", text: "#fafafa" };

export function getQualityColor(name: string | undefined): QualityColor {
  if (!name) return ZINC;
  const n = name.toLowerCase();

  const is2160 = n.includes("2160") || n.includes("4k");
  const is1080 = n.includes("1080");
  const is720 = n.includes("720");

  // Remux / Raw-HD — top-shelf, deserves its own accent.
  if (n.includes("remux") || n.includes("raw-hd")) {
    return { bg: "#a21caf", text: "#fdf4ff" };
  }

  if (n.includes("bluray") || n.includes("blu-ray")) {
    if (is2160) return { bg: "#7e22ce", text: "#faf5ff" }; // purple-700
    if (is1080) return { bg: "#1d4ed8", text: "#eff6ff" }; // blue-700
    if (is720) return { bg: "#0369a1", text: "#f0f9ff" }; // sky-700
    return { bg: "#1e40af", text: "#eff6ff" }; // blue-800
  }

  if (n.includes("web")) {
    if (is2160) return { bg: "#4338ca", text: "#eef2ff" }; // indigo-700
    if (is1080) return { bg: "#0e7490", text: "#ecfeff" }; // cyan-700
    if (is720) return { bg: "#0f766e", text: "#f0fdfa" }; // teal-700
    return { bg: "#155e75", text: "#ecfeff" }; // cyan-800
  }

  if (n.includes("hdtv")) {
    if (is1080) return { bg: "#065f46", text: "#ecfdf5" }; // emerald-800
    return { bg: "#064e3b", text: "#ecfdf5" }; // emerald-900
  }

  if (n.includes("dvd") || n.includes("sdtv")) {
    return ZINC;
  }

  return ZINC;
}
