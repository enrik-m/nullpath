/**
 * Records an ordered walkthrough of the app: boot → atlas → web region
 * → zone graph → node panel → mark complete → echo skip → achievement
 * → codex → stats → bounties → trophy room → back to atlas. Each step
 * lingers long enough that a viewer can register what's on screen.
 *
 * Output: `docs/demo.webm`. Conversion to mp4/gif happens at the end
 * via ffmpeg. Total length ~35-40 seconds depending on render speed.
 *
 * Usage:
 *   1. npx playwright install chromium    (one-time)
 *   2. npm run dev                        (in another terminal)
 *   3. npm run capture:demo
 *
 * Audio note: Playwright's recordVideo is video-only by design. The
 * app's SFX is synthesized at runtime via the Web Audio API (no audio
 * files), so it CAN'T be merged in post. To produce a demo with sound,
 * use OBS Studio or the OS screen recorder against a live browser.
 *
 * The auth gate: the script targets a dev build that has NO
 * VITE_SUPABASE_* env vars set, so isCloudMode() returns false and
 * SignInView is never reached — we land directly on BootView and
 * proceed through local-mode views.
 */

import { mkdirSync, existsSync, readdirSync, renameSync, statSync, unlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs");
const tmpDir = resolve(outDir, "_demo_tmp");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
if (existsSync(tmpDir)) {
  // Clean residue from a previous failed run.
  for (const f of readdirSync(tmpDir)) unlinkSync(resolve(tmpDir, f));
} else {
  mkdirSync(tmpDir, { recursive: true });
}

const BASE = process.env.NULLPATH_URL ?? "http://localhost:1421";

console.log(`[demo] target ${BASE}`);
console.log(`[demo] launching headless chromium…`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: {
    dir: tmpDir,
    size: { width: 1280, height: 720 },
  },
  // Force light/dark sensibly — the app is dark-only, but explicit.
  colorScheme: "dark",
  reducedMotion: "no-preference",
});

const page = await ctx.newPage();

// ---------------------------------------------------------------------------
// Inject a visible click ripple so the recorded video makes user
// interactions obvious (Playwright's headless mode doesn't render a
// system cursor in the capture). The ripple is a quick CSS pulse
// pinned to the page coords of the click.
// ---------------------------------------------------------------------------
await page.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `
    .__demo_click_ripple {
      position: fixed;
      width: 28px;
      height: 28px;
      margin-left: -14px;
      margin-top: -14px;
      border-radius: 50%;
      border: 2px solid #5cf2ff;
      box-shadow: 0 0 16px #5cf2ff, inset 0 0 8px #5cf2ff;
      pointer-events: none;
      z-index: 99999;
      animation: __demo_click_ripple_anim 0.55s ease-out forwards;
    }
    @keyframes __demo_click_ripple_anim {
      0%   { transform: scale(0.5); opacity: 1; }
      100% { transform: scale(2.4); opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  // Listen at the capture phase so the ripple shows even when click
  // handlers preventDefault().
  document.addEventListener(
    "click",
    (e) => {
      const r = document.createElement("div");
      r.className = "__demo_click_ripple";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.body.appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    true,
  );
});

// ---------------------------------------------------------------------------
// Helper: hold a step for `ms` so the recording lingers on each view.
// Playwright's waitForTimeout is fine here — we want a paced video, not
// "as fast as the browser can advance."
// ---------------------------------------------------------------------------
const beat = (ms) => page.waitForTimeout(ms);

// ---------------------------------------------------------------------------
// Helper: try a click, swallow errors. Some selectors only exist in
// certain states (e.g., "Mark complete" only when a node is selected).
// We don't want a missing button to crash the recording mid-walk.
// ---------------------------------------------------------------------------
async function maybeClick(selector, opts = {}) {
  try {
    await page.locator(selector).first().click({ timeout: 2000, ...opts });
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Walkthrough begins.
// ============================================================================

console.log(`[demo] step 01: boot sequence`);
await page.goto(BASE, { waitUntil: "domcontentloaded" });
// BootView animates ~2.5s of CRT log lines, then transitions to Atlas.
await beat(3500);

console.log(`[demo] step 02: atlas (3 region cards)`);
// Press 1 to ensure we're on Atlas (idempotent — already there post-boot).
await page.keyboard.press("1").catch(() => {});
await beat(2500);

console.log(`[demo] step 03: enter Web Pentesting region`);
await maybeClick("text=/web pentesting/i");
await beat(3500);

console.log(`[demo] step 04: enter first zone`);
// Zones render as constellation stars; click the first one.
const clickedZone =
  (await maybeClick("[data-zone-star]")) ||
  (await maybeClick(".np-pixel:has-text(/Z0\\d/)"));
if (!clickedZone) {
  console.warn(`[demo] couldn't find zone selector; falling back to keyboard`);
}
await beat(3500);

console.log(`[demo] step 05: pan around the zone graph`);
// Let the @xyflow react-flow nodes animate in.
await beat(1500);

console.log(`[demo] step 06: click a node`);
await maybeClick(".react-flow__node");
await beat(2200);

console.log(`[demo] step 07: mark complete`);
await maybeClick('button:has-text(/mark complete/i)');
await beat(1500);

console.log(`[demo] step 08: skip echo prompt`);
await maybeClick('button:has-text(/skip/i)');
await beat(800);

console.log(`[demo] step 09: dismiss achievement (if any)`);
await maybeClick('button:has-text(/^nice$/i)');
await beat(1200);

console.log(`[demo] step 10: codex (key 2)`);
await page.keyboard.press("Escape").catch(() => {});
await page.keyboard.press("2");
await beat(3000);

console.log(`[demo] step 11: stats (key 3)`);
await page.keyboard.press("3");
await beat(4000);

console.log(`[demo] step 12: bounties (key 4)`);
await page.keyboard.press("4");
await beat(3000);

console.log(`[demo] step 13: trophy room (key 5)`);
await page.keyboard.press("5");
await beat(3500);

console.log(`[demo] step 14: back to atlas (key 1)`);
await page.keyboard.press("1");
await beat(2000);

// ============================================================================
// Tear down — the video lands in tmpDir with a hash filename. Move it
// to docs/demo.webm and run the conversions.
// ============================================================================

await page.close();
await ctx.close();
await browser.close();

const candidates = readdirSync(tmpDir)
  .filter((n) => n.endsWith(".webm"))
  .map((n) => ({ n, t: statSync(resolve(tmpDir, n)).mtimeMs }))
  .sort((a, b) => b.t - a.t);

if (candidates.length === 0) {
  console.error("[demo] no .webm produced — recording failed");
  process.exit(1);
}

const chosen = candidates[0].n;
const finalWebm = resolve(outDir, "demo.webm");
if (existsSync(finalWebm)) unlinkSync(finalWebm);
renameSync(resolve(tmpDir, chosen), finalWebm);

// Clean tmp residue.
for (const f of readdirSync(tmpDir)) unlinkSync(resolve(tmpDir, f));

console.log(`[demo] webm saved → docs/demo.webm`);

// ----------------------------------------------------------------------------
// ffmpeg conversions: webm → mp4 (Twitter/LinkedIn) + webm → gif (README).
// We call ffmpeg via execSync; if it's not on PATH, we skip with a
// helpful message instead of failing the whole script.
// ----------------------------------------------------------------------------

const ffmpegPath = process.env.FFMPEG_PATH ?? "ffmpeg";

function tryFfmpeg(args, label) {
  try {
    execSync(`${ffmpegPath} ${args}`, { stdio: ["ignore", "ignore", "inherit"] });
    console.log(`[demo] ${label}`);
    return true;
  } catch (err) {
    console.warn(`[demo] ${label} skipped (ffmpeg failed or missing):`, err.message);
    return false;
  }
}

const mp4 = resolve(outDir, "demo.mp4");
const gif = resolve(outDir, "demo.gif");
if (existsSync(mp4)) unlinkSync(mp4);
if (existsSync(gif)) unlinkSync(gif);

tryFfmpeg(
  `-y -i "${finalWebm}" -c:v libx264 -crf 22 -pix_fmt yuv420p -movflags +faststart "${mp4}"`,
  `mp4 saved → docs/demo.mp4`,
);

// GIF: scale down + reduce framerate so the file isn't 30 MB. The
// two-pass palettegen approach gives much better color than the
// naive single-pass fps+scale filter chain.
tryFfmpeg(
  `-y -i "${finalWebm}" -vf "fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" -loop 0 "${gif}"`,
  `gif saved → docs/demo.gif`,
);

console.log(``);
console.log(`Recording complete. Files:`);
console.log(`  docs/demo.webm  — Playwright native, GitHub README inline upload`);
console.log(`  docs/demo.mp4   — Twitter / LinkedIn / Reddit native`);
console.log(`  docs/demo.gif   — README fallback (lower quality)`);
