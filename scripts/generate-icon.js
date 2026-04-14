const sharp = require("sharp");
const path = require("path");

const ICON_SIZE = 1024;

// Well-proportioned D letter
// Outer: (305,252) to (745,772) = 440w x 520h
// Inner counter: half-ellipse cutout
// Geometric center: ~(525, 512) — shifted slightly right for optical balance
// (the heavy stem on the left shifts visual center left, so the geometric
//  center sits right of canvas center to compensate)
const D_PATH = `
    M 305 252
    L 490 252
    C 631 252 745 369 745 512
    C 745 655 631 772 490 772
    L 305 772
    Z
    M 420 367
    C 536 367 630 432 630 512
    C 630 592 536 657 420 657
    Z
`;

// ── Main app icon (1024x1024) ────────────────────────────────────────────────
const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c0f1a"/>
      <stop offset="100%" stop-color="#141829"/>
    </linearGradient>
    <linearGradient id="main-grad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="50%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="14" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="50"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="224" fill="url(#bg-grad)"/>

  <!-- Subtle ambient glow behind the D -->
  <ellipse cx="525" cy="512" rx="230" ry="260" fill="#3a86ff" opacity="0.06" filter="url(#soft-glow)"/>

  <!-- D letter -->
  <path d="${D_PATH}" fill="url(#main-grad)" fill-rule="evenodd" filter="url(#glow)"/>
</svg>
`;

// ── Android adaptive icon foreground (1024x1024, transparent bg) ─────────────
// Android composites this over the backgroundColor from app.config.ts (#09090b).
// Scaled to 93% and centered at (512,512) to stay within the 66% safe zone.
// Also used as the notification small-icon silhouette (alpha channel only).
const adaptiveIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="main-grad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="50%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>

  <!-- D centered in safe zone on transparent background -->
  <g transform="translate(512 512) scale(0.93) translate(-525 -512)">
    <path d="${D_PATH}" fill="url(#main-grad)" fill-rule="evenodd"/>
  </g>
</svg>
`;

// ── Splash screen (1284x2778) ────────────────────────────────────────────────
// Radial gradient fades to #09090b at edges to blend with app.config.ts
// splash.backgroundColor. D at 80% scale centered above vertical midpoint.
const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <defs>
    <linearGradient id="main-grad" x1="20%" y1="0%" x2="80%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="50%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Solid background — matches splash.backgroundColor in app.config.ts
       so edges are invisible when resizeMode is "contain" -->
  <rect width="1284" height="2778" fill="#09090b"/>

  <!-- D letter -->
  <g transform="translate(642 1220) scale(0.8) translate(-525 -512)">
    <path d="${D_PATH}" fill="url(#main-grad)" fill-rule="evenodd" filter="url(#glow)"/>
  </g>

  <!-- App name -->
  <text x="642" y="1530" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="82" font-weight="700" fill="white">Dashboarr</text>

  <!-- Subtitle -->
  <text x="642" y="1595" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="28" font-weight="400" fill="#52525b" letter-spacing="4">MEDIA SERVER MANAGER</text>
</svg>
`;

async function generate() {
  const assetsDir = path.join(__dirname, "..", "assets");

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
  ]);
}

generate().catch(console.error);
