/**
 * Renders the SVG branding assets (favicon, OG image) to the PNG
 * formats that social-share platforms actually accept. SVG is the
 * source-of-truth (in `public/`); the rendered PNGs are committed
 * alongside so static hosts serve them without re-running this
 * script on every deploy.
 *
 * Run via `npm run build:branding` whenever the SVGs change.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

async function renderPng(svgPath, outPath, width, height) {
  const svg = readFileSync(svgPath);
  const buf = await sharp(svg, { density: 300 })
    .resize(width, height, { fit: "fill" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(outPath, buf);
  console.log(
    `[build-branding] ${svgPath.replace(root, ".")} → ${outPath.replace(root, ".")} (${buf.length} bytes)`,
  );
}

await renderPng(
  resolve(root, "public/og-image.svg"),
  resolve(root, "public/og-image.png"),
  1200,
  630,
);

// Apple touch icon — 180×180 PNG, used by iOS when adding to home screen.
await renderPng(
  resolve(root, "public/favicon.svg"),
  resolve(root, "public/apple-touch-icon.png"),
  180,
  180,
);

// Generic 32×32 favicon PNG fallback for browsers that don't
// pick up the SVG one (very old IE, some embedded browsers).
await renderPng(
  resolve(root, "public/favicon.svg"),
  resolve(root, "public/favicon-32.png"),
  32,
  32,
);

// PWA / Android home-screen icons referenced from site.webmanifest.
// 192 and 512 are the canonical "Add to Home Screen" sizes — Android
// picks one based on device DPI. The maskable version uses the
// safe-zone-scaled SVG so circular / squircle masks don't clip.
await renderPng(
  resolve(root, "public/favicon.svg"),
  resolve(root, "public/icon-192.png"),
  192,
  192,
);
await renderPng(
  resolve(root, "public/favicon.svg"),
  resolve(root, "public/icon-512.png"),
  512,
  512,
);
await renderPng(
  resolve(root, "public/favicon-maskable.svg"),
  resolve(root, "public/icon-maskable-512.png"),
  512,
  512,
);
