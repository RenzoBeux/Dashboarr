const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const assetsDir = path.join(__dirname, "..", "assets");

function generateIcon(size, filename, padding = 0) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, size, size);

  const innerSize = size - padding * 2;
  const cx = size / 2;
  const cy = size / 2;

  // Rounded rectangle background accent
  const rectSize = innerSize * 0.7;
  const rectX = cx - rectSize / 2;
  const rectY = cy - rectSize / 2;
  const radius = rectSize * 0.2;

  ctx.beginPath();
  ctx.moveTo(rectX + radius, rectY);
  ctx.lineTo(rectX + rectSize - radius, rectY);
  ctx.quadraticCurveTo(rectX + rectSize, rectY, rectX + rectSize, rectY + radius);
  ctx.lineTo(rectX + rectSize, rectY + rectSize - radius);
  ctx.quadraticCurveTo(rectX + rectSize, rectY + rectSize, rectX + rectSize - radius, rectY + rectSize);
  ctx.lineTo(rectX + radius, rectY + rectSize);
  ctx.quadraticCurveTo(rectX, rectY + rectSize, rectX, rectY + rectSize - radius);
  ctx.lineTo(rectX, rectY + radius);
  ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
  ctx.closePath();

  // Gradient fill
  const gradient = ctx.createLinearGradient(rectX, rectY, rectX + rectSize, rectY + rectSize);
  gradient.addColorStop(0, "#3b82f6");
  gradient.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = gradient;
  ctx.fill();

  // "D" letter
  const fontSize = innerSize * 0.45;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("D", cx, cy + fontSize * 0.03);

  // Small dashboard dots (3x2 grid) below the D
  const dotSize = innerSize * 0.025;
  const dotGap = dotSize * 2.5;
  const dotsStartX = cx - dotGap;
  const dotsStartY = cy + fontSize * 0.45;

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const dx = dotsStartX + col * dotGap;
      const dy = dotsStartY + row * dotGap;
      ctx.beginPath();
      ctx.arc(dx, dy, dotSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(assetsDir, filename), buffer);
  console.log(`Generated ${filename} (${size}x${size})`);
}

function generateSplash() {
  const width = 1284;
  const height = 2778;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // Dark background
  ctx.fillStyle = "#09090b";
  ctx.fillRect(0, 0, width, height);

  // Icon in center
  const iconSize = 200;
  const cx = width / 2;
  const cy = height / 2 - 60;

  // Rounded square
  const radius = iconSize * 0.2;
  const rectX = cx - iconSize / 2;
  const rectY = cy - iconSize / 2;

  ctx.beginPath();
  ctx.moveTo(rectX + radius, rectY);
  ctx.lineTo(rectX + iconSize - radius, rectY);
  ctx.quadraticCurveTo(rectX + iconSize, rectY, rectX + iconSize, rectY + radius);
  ctx.lineTo(rectX + iconSize, rectY + iconSize - radius);
  ctx.quadraticCurveTo(rectX + iconSize, rectY + iconSize, rectX + iconSize - radius, rectY + iconSize);
  ctx.lineTo(rectX + radius, rectY + iconSize);
  ctx.quadraticCurveTo(rectX, rectY + iconSize, rectX, rectY + iconSize - radius);
  ctx.lineTo(rectX, rectY + radius);
  ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(rectX, rectY, rectX + iconSize, rectY + iconSize);
  gradient.addColorStop(0, "#3b82f6");
  gradient.addColorStop(1, "#1d4ed8");
  ctx.fillStyle = gradient;
  ctx.fill();

  // "D" letter
  const fontSize = iconSize * 0.55;
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("D", cx, cy + 4);

  // App name below icon
  ctx.font = `bold 48px sans-serif`;
  ctx.fillStyle = "#f4f4f5";
  ctx.fillText("Dashboarr", cx, cy + iconSize / 2 + 60);

  // Subtitle
  ctx.font = `300 24px sans-serif`;
  ctx.fillStyle = "#71717a";
  ctx.fillText("Media Server Manager", cx, cy + iconSize / 2 + 100);

  const buffer = canvas.toBuffer("image/png");
  fs.writeFileSync(path.join(assetsDir, "splash.png"), buffer);
  console.log(`Generated splash.png (${width}x${height})`);
}

// Generate all assets
generateIcon(1024, "icon.png");
generateIcon(1024, "adaptive-icon.png", 150); // Extra padding for Android adaptive
generateSplash();

console.log("All assets generated!");
