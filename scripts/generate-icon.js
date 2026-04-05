const sharp = require("sharp");
const path = require("path");
const fs = require("fs");

const ICON_SIZE = 1024;

const iconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${ICON_SIZE}" height="${ICON_SIZE}" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c0f1a"/>
      <stop offset="100%" stop-color="#141829"/>
    </linearGradient>
    <linearGradient id="main-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="45%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
    <linearGradient id="grid-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="100%" stop-color="#3a86ff"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="35" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="60"/>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="1024" height="1024" rx="224" fill="url(#bg-grad)"/>

  <!-- Ambient glow behind the D -->
  <ellipse cx="520" cy="500" rx="280" ry="300" fill="#3a86ff" opacity="0.08" filter="url(#soft-glow)"/>

  <!-- D letter - bold geometric with cutout -->
  <path d="
    M 260 215
    L 510 215
    C 620 215 710 250 770 315
    C 830 380 860 445 860 520
    C 860 595 830 660 770 725
    C 710 790 620 825 510 825
    L 260 825
    Z
    M 400 365
    L 400 675
    L 510 675
    C 575 675 625 655 660 615
    C 695 575 715 545 715 520
    C 715 495 695 465 660 425
    C 625 385 575 365 510 365
    Z
  " fill="url(#main-grad)" fill-rule="evenodd" filter="url(#glow)"/>

</svg>
`;

const splashSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2778" viewBox="0 0 1284 2778">
  <defs>
    <linearGradient id="bg-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0c0f1a"/>
      <stop offset="100%" stop-color="#141829"/>
    </linearGradient>
    <linearGradient id="main-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#06d6a0"/>
      <stop offset="45%" stop-color="#3a86ff"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="12" result="blur"/>
      <feMerge>
        <feMergeNode in="blur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="40"/>
    </filter>
  </defs>

  <!-- Full background -->
  <rect width="1284" height="2778" fill="url(#bg-grad)"/>

  <!-- Ambient glow -->
  <ellipse cx="642" cy="1280" rx="200" ry="200" fill="#3a86ff" opacity="0.06" filter="url(#soft-glow)"/>

  <!-- Mini icon - 200x200 centered -->
  <g transform="translate(542, 1160) scale(0.25)">
    <rect width="800" height="800" rx="180" fill="url(#bg-grad)" stroke="#1e2440" stroke-width="3"/>
    <path d="
      M 210 172
      L 408 172
      C 496 172 568 200 616 252
      C 664 304 688 356 688 416
      C 688 476 664 528 616 580
      C 568 632 496 660 408 660
      L 210 660
      Z
      M 322 292
      L 322 540
      L 408 540
      C 460 540 500 524 528 492
      C 556 460 572 436 572 416
      C 572 396 556 372 528 340
      C 500 308 460 292 408 292
      Z
    " fill="url(#main-grad)" fill-rule="evenodd" filter="url(#glow)"/>
  </g>

  <!-- App name -->
  <text x="642" y="1430" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="52" font-weight="700" fill="white" letter-spacing="1">Dashboarr</text>
  <text x="642" y="1475" text-anchor="middle" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="22" font-weight="400" fill="#6b7280" letter-spacing="2">MEDIA SERVER MANAGER</text>
</svg>
`;

async function generate() {
  const assetsDir = path.join(__dirname, "..", "assets");

  // Generate icon
  await sharp(Buffer.from(iconSvg))
    .resize(ICON_SIZE, ICON_SIZE)
    .png()
    .toFile(path.join(assetsDir, "icon.png"));
  console.log("Generated icon.png (1024x1024)");

  // Generate adaptive icon (foreground only, with padding for Android)
  await sharp(Buffer.from(iconSvg))
    .resize(ICON_SIZE, ICON_SIZE)
    .png()
    .toFile(path.join(assetsDir, "adaptive-icon.png"));
  console.log("Generated adaptive-icon.png (1024x1024)");

  // Generate splash
  await sharp(Buffer.from(splashSvg))
    .resize(1284, 2778)
    .png()
    .toFile(path.join(assetsDir, "splash.png"));
  console.log("Generated splash.png (1284x2778)");
}

generate().catch(console.error);
