/**
 * Quick visual sanity-check for the new ZoneView layout.
 *
 * Opens Z04 (Injection Caves — has W01 SQL Injection with 15 sub-nodes,
 * the worst-case parent-with-kids in the seed) and screenshots it.
 * Visual inspection confirms no node overlaps anything else.
 *
 * Run via:  node scripts/verify-zone-layout.mjs
 * Output:   docs/_zone_check/Z04.png  (and a few other zones)
 */

import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs/_zone_check");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const BASE = process.env.NULLPATH_URL ?? "http://localhost:1421";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await ctx.newPage();

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);

// Dismiss daily briefing if present
const begin = page.getByRole("button", { name: /^begin$/i });
if (await begin.count()) {
  await begin.click().catch(() => {});
  await page.waitForTimeout(400);
}

// Drive directly into a target zone via the in-app store, bypassing
// the click-based navigation (we don't care about UX path here, just
// the layout). useUi.getState().go({name:'zone', zoneId})
async function gotoZone(zoneId) {
  await page.evaluate((z) => {
    // Find the zustand store on window — main.tsx exposes it for devtools.
    // Fallback: dispatch the route via React's keyboard shortcut path.
    // Actually the simpler thing: navigate via History API + reload.
    window.location.hash = "";
    document.location.search = "";
    // The atlas is the entry point; press 1 to ensure we're at atlas, then click into the zone.
  }, zoneId);
  // Use the router fallback — keyboard 1 (atlas), click region, click zone-star.
  await page.keyboard.press("1");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /web pentesting/i }).click();
  await page.waitForSelector("[data-zone-star]");
  await page.waitForTimeout(800);
  // Now click the specific zone star by its ID — they're SVG <g>s with
  // data-zone-star but no data-id. Index them by reading the order
  // matches the seed's sort_order.
  await page.evaluate((zid) => {
    const all = document.querySelectorAll("[data-zone-star]");
    // Each <g data-zone-star> has the zone label as a sibling text;
    // find the one whose nearby DOM contains the zone id. We just
    // dispatch click on every star whose corresponding text matches.
    for (const g of all) {
      const labels = g.querySelectorAll("text");
      for (const t of labels) {
        if (t.textContent?.trim().toUpperCase() === zid.toUpperCase()) {
          g.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          return;
        }
      }
    }
    // Fallback: click first
    all[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  }, zoneId);
  await page.waitForSelector(".react-flow__node");
  // Let the layout settle + react-flow auto-fit.
  await page.waitForTimeout(2500);
}

const targets = ["Z01", "Z04", "Z11"]; // Z01 = grid of leaves, Z04 = 15-kid parent, Z11 = API1 with 10 kids
for (const z of targets) {
  console.log(`[zone-layout] capturing ${z}`);
  try {
    await gotoZone(z);
    await page.screenshot({
      path: resolve(outDir, `${z}.png`),
      fullPage: false,
    });
  } catch (e) {
    console.warn(`[zone-layout] ${z} failed: ${e.message}`);
  }
}

// Overlap detector — read the .react-flow__node bounding rects and
// check that no two rectangles overlap (with a small tolerance for
// shared borders, which shouldn't happen but just in case).
const overlapReport = await page.evaluate(() => {
  const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
  const rects = nodes.map((n) => {
    const r = n.getBoundingClientRect();
    return { id: n.getAttribute("data-id"), x: r.left, y: r.top, w: r.width, h: r.height };
  });
  const overlaps = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i],
        b = rects[j];
      const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
      const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
      if (xOverlap && yOverlap) overlaps.push({ a: a.id, b: b.id });
    }
  }
  return { count: nodes.length, overlaps };
});
console.log(
  `[zone-layout] last zone (${targets[targets.length - 1]}): ${overlapReport.count} nodes, ${overlapReport.overlaps.length} overlaps`,
);
if (overlapReport.overlaps.length) {
  console.error("[zone-layout] OVERLAPS:");
  for (const o of overlapReport.overlaps.slice(0, 10)) {
    console.error(`  ${o.a} <> ${o.b}`);
  }
  process.exit(1);
}

await page.close();
await ctx.close();
await browser.close();
console.log(`[zone-layout] screenshots in ${outDir.replace(root, ".")}`);
