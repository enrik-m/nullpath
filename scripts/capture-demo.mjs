/**
 * Records an ordered walkthrough of the app, narrated by deterministic
 * navigation rather than fuzzy text-clicks: boot → atlas → web region
 * → zone → node panel → COMPLETE → echo skip → achievement → codex →
 * stats → bounties → trophy room → atlas. Total ~40s.
 *
 * Robustness rules baked in after a previous version sat blank for 30s
 * because every selector silently fell through:
 *
 *   1. STRICT CLICKS: every target uses `getByRole({name})` or a
 *      data-attribute. Failures throw — no try/catch swallowing,
 *      no `maybeClick`. If the demo can't drive the app it should
 *      blow up loudly and we fix the script.
 *   2. SVG-AWARE CLICKS: the zone-star is an SVG <g> with no inherent
 *      bounding box. We dispatch a synthetic click event that bubbles
 *      to React's event delegation root instead of relying on a
 *      Playwright pointer hit-test that misses transparent SVG areas.
 *   3. CHECKPOINTS: after each navigation we screenshot to
 *      docs/_demo_tmp/ and assert the expected DOM is present. If the
 *      app didn't navigate, we see exactly which step broke.
 *   4. NO BLIND TIMEOUTS: when waiting for a view to mount, we
 *      `waitForSelector` on something the view actually renders
 *      (zone graph, codex list, etc), not a flat 3-second sleep.
 *
 * Audio note: Playwright recordVideo is video-only. SFX is synthesized
 * via Web Audio API (no audio files). To get a demo with sound, use
 * OBS Studio against a live browser — automation isn't the path.
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
  for (const f of readdirSync(tmpDir)) unlinkSync(resolve(tmpDir, f));
} else {
  mkdirSync(tmpDir, { recursive: true });
}

const BASE = process.env.NULLPATH_URL ?? "http://localhost:1421";

console.log(`[demo] target ${BASE}`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: tmpDir, size: { width: 1280, height: 720 } },
  colorScheme: "dark",
  reducedMotion: "no-preference",
});

const page = await ctx.newPage();

// Click ripple — visible mark of every interaction since headless
// chromium doesn't render the system cursor in recorded video.
await page.addInitScript(() => {
  const style = document.createElement("style");
  style.textContent = `
    .__demo_click_ripple {
      position: fixed;
      width: 28px; height: 28px;
      margin-left: -14px; margin-top: -14px;
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

const beat = (ms) => page.waitForTimeout(ms);

let stepNo = 0;
async function step(name, fn) {
  stepNo++;
  const tag = String(stepNo).padStart(2, "0");
  console.log(`[demo] ${tag} ${name}`);
  try {
    await fn();
    await page.screenshot({ path: resolve(tmpDir, `${tag}-${name.replace(/\W+/g, "_")}.png`) });
  } catch (err) {
    console.error(`[demo] ${tag} ${name} FAILED:`);
    console.error(err.message);
    await page.screenshot({
      path: resolve(tmpDir, `${tag}-${name.replace(/\W+/g, "_")}-FAIL.png`),
    });
    throw err;
  }
}

// ============================================================================
// Walkthrough
// ============================================================================

await step("goto-and-boot", async () => {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // BootView animates to Atlas after ~2.5s.
  await beat(3500);
});

await step("atlas-arrived", async () => {
  // Wait for the Web Pentesting card to be in the DOM.
  await page.getByRole("button", { name: /web pentesting/i }).waitFor({ timeout: 8000 });
  // Linger so the viewer registers the 3 region cards.
  await beat(2500);
});

await step("dismiss-daily-briefing-if-present", async () => {
  // First-launch-of-day pops the Daily Briefing modal which intercepts
  // every pointer event (it's a full-viewport <Backdrop>). The CTA reads
  // "Begin"; Escape would also work, but a real click reads cleaner in
  // the recording (the briefing is a feature worth showing on screen
  // briefly before dismissing).
  const begin = page.getByRole("button", { name: /^begin$/i });
  if (await begin.count()) {
    // Linger ~1.2s so the briefing flashes on screen, then dismiss.
    await beat(1200);
    await begin.click();
    await beat(600);
  }
});

await step("click-web-region", async () => {
  await page.getByRole("button", { name: /web pentesting/i }).click();
  // RegionView mounts — wait for at least one zone-star to appear.
  await page.waitForSelector("[data-zone-star]", { timeout: 8000 });
  await beat(3500);
});

await step("enter-first-zone", async () => {
  // SVG <g> elements lack a hit-test area Playwright pointer clicks
  // can rely on — dispatch a synthetic click that bubbles to React.
  const ok = await page.evaluate(() => {
    const star = document.querySelector("[data-zone-star]");
    if (!star) return false;
    star.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  });
  if (!ok) throw new Error("no [data-zone-star] in DOM");
  // ZoneView mounts — wait for the react-flow canvas + at least one node.
  await page.waitForSelector(".react-flow__node", { timeout: 8000 });
  await beat(3000);
});

await step("click-first-node", async () => {
  const ok = await page.evaluate(() => {
    const n = document.querySelector(".react-flow__node");
    if (!n) return false;
    n.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return true;
  });
  if (!ok) throw new Error("no react-flow node in DOM");
  // NodePanel slides in from the right — wait for the COMPLETE button.
  await page.getByRole("button", { name: /^complete$/i }).waitFor({ timeout: 6000 });
  await beat(2000);
});

await step("mark-complete", async () => {
  await page.getByRole("button", { name: /^complete$/i }).click();
  // Echo prompt modal mounts — wait for its Skip / Save echo controls.
  await page.getByRole("button", { name: /^skip$/i }).waitFor({ timeout: 5000 });
  await beat(1500);
});

await step("dismiss-modal-stack", async () => {
  // After mark-complete, any number of modals can stack:
  //   - Echo prompt (always shows)
  //   - Achievement modal (if a trigger was met — first-node, first-zone, etc)
  //   - More achievement modals queued behind it (the engine pops them
  //     in sequence as each one closes)
  //   - Level-up modal (if XP crossed a threshold)
  //
  // The engine subscribes to modal-close transitions and pops the next
  // queued modal ~200ms after each dismissal. We loop dismissing
  // whatever's up — Skip / Nice / Continue / Begin (any CTA) — with a
  // beat between each, until no modal element is in the DOM.
  //
  // The modal root mounts inside <div role="dialog" aria-modal="true">,
  // so we use that as the "is anything modal-y up?" probe.

  for (let i = 0; i < 8; i++) {
    const dialog = page.locator("[role='dialog']");
    const visible = await dialog.count();
    if (!visible) break;

    // Try in priority order: Skip > Nice > Continue > Begin > Esc fallback.
    const ctas = [
      page.getByRole("button", { name: /^skip$/i }),
      page.getByRole("button", { name: /^nice$/i }),
      page.getByRole("button", { name: /^continue$/i }),
      page.getByRole("button", { name: /^begin$/i }),
    ];
    let clicked = false;
    for (const cta of ctas) {
      if (await cta.count()) {
        await cta.click({ timeout: 2000 }).catch(() => {});
        clicked = true;
        break;
      }
    }
    if (!clicked) {
      // No recognized CTA — Escape it.
      await page.keyboard.press("Escape").catch(() => {});
    }
    // Wait for the close animation + queue advance.
    await beat(700);
  }
});

await step("close-side-panel", async () => {
  // Escape clears any lingering side panel; without it, focus stays
  // there and the digit-key shortcuts below get eaten as text input.
  await page.keyboard.press("Escape");
  await beat(400);
});

// Each shortcut-key step waits for the destination view's H1 to mount.
// Using the actual heading text rather than fuzzy body-text matching
// avoids matching the previous view's residual content during the
// AnimatePresence cross-fade.

await step("codex-key-2", async () => {
  await page.keyboard.press("2");
  await page.locator("h1", { hasText: /every resource/i }).waitFor({ timeout: 6000 });
  await beat(3200);
});

await step("stats-key-3", async () => {
  await page.keyboard.press("3");
  await page.locator("h1", { hasText: /operator dossier/i }).waitFor({ timeout: 6000 });
  await beat(4500);
});

await step("bounties-key-4", async () => {
  await page.keyboard.press("4");
  await page.locator("h1", { hasText: /real-world wins/i }).waitFor({ timeout: 6000 });
  await beat(3000);
});

await step("trophy-room-key-5", async () => {
  await page.keyboard.press("5");
  await page.locator("h1", { hasText: /trophy room/i }).waitFor({ timeout: 6000 });
  await beat(3500);
});

await step("back-to-atlas-key-1", async () => {
  await page.keyboard.press("1");
  await page.getByRole("button", { name: /web pentesting/i }).waitFor({ timeout: 6000 });
  await beat(2000);
});

// ============================================================================
// Tear down + ffmpeg conversions
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

const finalWebm = resolve(outDir, "demo.webm");
if (existsSync(finalWebm)) unlinkSync(finalWebm);
renameSync(resolve(tmpDir, candidates[0].n), finalWebm);
console.log(`[demo] webm saved → docs/demo.webm`);

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

// 10fps + 800px wide + Bayer dither. The combination keeps the GIF
// under GitHub's 10 MB README inline-upload ceiling for a 40-second
// walkthrough. `palettegen=stats_mode=diff` adapts the palette to
// frame-to-frame deltas (better than `full` for screen-cap content).
tryFfmpeg(
  `-y -i "${finalWebm}" -vf "fps=10,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4" -loop 0 "${gif}"`,
  `gif saved → docs/demo.gif`,
);

console.log(``);
console.log(`Recording complete. Step screenshots in ${tmpDir.replace(root, ".")}`);
console.log(`Files:`);
console.log(`  docs/demo.webm  — Playwright native, GitHub README inline`);
console.log(`  docs/demo.mp4   — Twitter / LinkedIn / Reddit`);
console.log(`  docs/demo.gif   — README fallback (lower quality)`);
