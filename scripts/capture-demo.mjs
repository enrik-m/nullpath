/**
 * Records a 30-second walkthrough video of the app: boot →
 * atlas → region → zone graph → complete a node → trophy unlock →
 * trophy room. Output is .webm (Playwright's native format), with
 * instructions for converting to .gif at the end.
 *
 * Usage:
 *   1. npx playwright install chromium    (one-time)
 *   2. npm run dev                        (in another terminal)
 *   3. npm run capture:demo
 *   4. Output: docs/demo.webm
 *   5. Optional: convert to GIF (see end of file)
 *
 * Why .webm and not .gif natively? Playwright records video, not GIFs;
 * GIFs are huge for anything > 5s and look worse than .webm. GitHub
 * READMEs accept .webm uploads now (drag the file into the editor)
 * and render them inline. Twitter / LinkedIn want .mp4 (use ffmpeg
 * to convert).
 */

import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const BASE = process.env.NULLPATH_URL ?? "http://localhost:1420";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: outDir,
    size: { width: 1280, height: 720 },
  },
});
const page = await ctx.newPage();

console.log(`[demo] target ${BASE}`);
await page.goto(BASE);

// Watch the boot sequence (≈ 2.5s)
await page.waitForTimeout(3000);

// Atlas → look around
await page.keyboard.press("1");
await page.waitForTimeout(1800);

// Click the unlocked Web region
await page.locator("text=WEB PENTESTING").click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2500);

// Click the first zone
await page
  .locator("[data-zone-star]")
  .first()
  .click({ timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(3000);

// Click on a node (any visible top-level)
await page
  .locator(".react-flow__node")
  .first()
  .click({ timeout: 4000 })
  .catch(() => {});
await page.waitForTimeout(2000);

// Click "Mark complete" — the side panel should be open. Selector
// matches the existing button text.
await page.locator('button:has-text("Mark complete")').click({ timeout: 4000 }).catch(() => {});
await page.waitForTimeout(1500);

// Echo modal pops — click Skip to dismiss
await page.locator('button:has-text("Skip")').click({ timeout: 3000 }).catch(() => {});

// Achievement modal might pop — click Nice
await page.locator('button:has-text("Nice")').click({ timeout: 3500 }).catch(() => {});

await page.waitForTimeout(1500);

// Jump to Trophy Room (key 5)
await page.keyboard.press("Escape");
await page.keyboard.press("5");
await page.waitForTimeout(2500);

// Jump to Stats (key 3)
await page.keyboard.press("3");
await page.waitForTimeout(3000);

await page.close();
await ctx.close();
await browser.close();

console.log(`[demo] webm saved to ${outDir.replace(root, ".")}`);
console.log(``);
console.log(`To convert to .mp4 (Twitter / LinkedIn / Reddit):`);
console.log(`  ffmpeg -i docs/<video>.webm -c:v libx264 -crf 22 -pix_fmt yuv420p docs/demo.mp4`);
console.log(``);
console.log(`To convert to .gif (smaller, lower quality):`);
console.log(`  ffmpeg -i docs/<video>.webm -vf "fps=12,scale=960:-1:flags=lanczos" \\`);
console.log(`    -loop 0 docs/demo.gif`);
