const sharp = require("sharp");
const path = require("path");

const ICON_SIZE = 1024;

// Flat circular badge: broken gradient ring (gauge-style gap at the bottom)
// with a bold flat D inside. Geometry (1024 viewBox, centered at 512,512):
//   ring r=330, stroke 60, round caps, 300deg arc with the 60deg gap centered
//   at the bottom; D letterform 540w x 560h at scale 1, drawn at 0.6.
// Glyph extent: r = 360 (ring radius + half stroke).
const RING_ARC = "M 347 797.8 A 330 330 0 1 1 677 797.8";

// Bold flat D, centered at (512,512)
const D_PATH = `
    M 282 232
    L 500 232
    C 662 232 782 356 782 512
    C 782 668 662 792 500 792
    L 282 792
    C 258 792 242 776 242 752
    L 242 272
    C 242 248 258 232 282 232
    Z
    M 392 372
    L 490 372
    C 576 372 636 432 636 512
    C 636 592 576 652 490 652
    L 392 652
    Z
`;

const D_COLOR = "#f2f4fc";
const BG_COLOR = "#101528";

// Brand gradient along the ring, teal (left) -> blue (top) -> violet (right)
const BRAND_GRAD = `
    <linearGradient id="brand" x1="0%" y1="70%" x2="100%" y2="30%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="50%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
`;

// D box center is (512,512), but the right bowl only touches its extreme at
// the midline, so the glyph reads left-of-center inside the ring. Translating
// from x=487 shifts it 15px right at 0.6 scale for optical centering.
const BADGE = `
    <path d="${RING_ARC}" fill="none" stroke="url(#brand)" stroke-width="60" stroke-linecap="round"/>
    <g transform="translate(512 512) scale(0.6) translate(-487 -512)">
      <path d="${D_PATH}" fill="${D_COLOR}" fill-rule="evenodd"/>
    </g>
`;

// ── Main app icon (1024x1024) ────────────────────────────────────────────────
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>${BRAND_GRAD}</defs>
  <rect width="1024" height="1024" rx="224" fill="${BG_COLOR}"/>
  ${BADGE}
</svg>
`;

// ── Android adaptive icon foreground (1024x1024, transparent bg) ─────────────
// Android composites this over the backgroundColor from app.config.ts (#09090b).
// Launchers mask to the inner 72/108 of the canvas (~683px here); Material's
// keyline for circular artwork is 52/108 (~493px). Glyph extent is 720px, so
// scale 0.68 (= 490px) lands on the keyline — 0.9 (648px) overflowed even the
// 66/108 safe zone (~626px) and touched the mask edge on circular launchers.
// Also used as the notification small-icon silhouette (alpha channel only)
// and the Android 12+ splash logo (safe circle: inner 2/3).
const adaptiveIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>${BRAND_GRAD}</defs>

  <!-- Badge centered in safe zone on transparent background -->
  <g transform="translate(512 512) scale(0.68) translate(-512 -512)">
    ${BADGE}
  </g>
</svg>
`;

// ── Splash screen (1284x2778) ────────────────────────────────────────────────
// Solid #09090b background matches splash.backgroundColor in app.config.ts.
// Badge at 60% scale centered above vertical midpoint.
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <defs>${BRAND_GRAD}</defs>

  <!-- Solid background — matches splash.backgroundColor in app.config.ts
       so edges are invisible when resizeMode is "contain" -->
  <rect width="1284" height="2778" fill="#09090b"/>

  <!-- Badge -->
  <g transform="translate(642 1190) scale(0.6) translate(-512 -512)">
    ${BADGE}
  </g>

  <!-- App name -->
  <text x="642" y="1530" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="82" font-weight="700" fill="white">Dashboarr</text>

  <!-- Subtitle -->
  <text x="642" y="1595" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" font-weight="400" fill="#52525b" letter-spacing="4">MEDIA SERVER MANAGER</text>
</svg>
`;

// Android 12+ system splash shows a small centered icon drawable (288dp), not
// the full splash image. Prebuild derives these from android.splash.image
// (the adaptive icon art); we also write them directly so a regenerate doesn't
// require a full `expo prebuild`. Sizes are 288dp at each density bucket.
const ANDROID_SPLASH_DENSITIES = {
  mdpi: 288,
  hdpi: 432,
  xhdpi: 576,
  xxhdpi: 864,
  xxxhdpi: 1152,
};

async function generate() {
  const assetsDir = path.join(__dirname, "..", "assets");
  const androidRes = path.join(__dirname, "..", "android", "app", "src", "main", "res");

  await Promise.all([
    sharp(Buffer.from(iconSvg))
      .resize(ICON_SIZE, ICON_SIZE)
      .png()
      .toFile(path.join(assetsDir, "icon.png"))
      .then(() => console.log("Generated icon.png (1024x1024)")),

    sharp(Buffer.from(adaptiveIconSvg))
      .resize(ICON_SIZE, ICON_SIZE)
      .png()
      .toFile(path.join(assetsDir, "adaptive-icon.png"))
      .then(() => console.log("Generated adaptive-icon.png (1024x1024)")),

    sharp(Buffer.from(iconSvg))
      .resize(512, 512)
      .png()
      .toFile(path.join(assetsDir, "playstore-icon.png"))
      .then(() => console.log("Generated playstore-icon.png (512x512)")),

    sharp(Buffer.from(splashSvg))
      .resize(1284, 2778)
      .png()
      .toFile(path.join(assetsDir, "splash.png"))
      .then(() => console.log("Generated splash.png (1284x2778)")),

    ...Object.entries(ANDROID_SPLASH_DENSITIES).map(([density, size]) =>
      sharp(Buffer.from(adaptiveIconSvg))
        .resize(size, size)
        .png()
        .toFile(path.join(androidRes, `drawable-${density}`, "splashscreen_logo.png"))
        .then(() =>
          console.log(`Generated android splashscreen_logo.png ${density} (${size}x${size})`)
        )
    ),
  ]);
}

generate().catch(console.error);
