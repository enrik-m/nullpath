/**
 * One-shot verifier for the new sort_order-driven RegionView layout.
 * Captures the Web region's constellation, then reads back each
 * data-zone-star's screen position and asserts that zones appear
 * in numeric order when scanned top-to-bottom then left-to-right.
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

async function dismissModals() {
  for (let i = 0; i < 6; i++) {
    if (!(await page.locator("[role='dialog']").count())) return;
    const begin = page.getByRole("button", { name: /^begin$/i });
    if (await begin.count()) await begin.click({ timeout: 1500 }).catch(() => {});
    else await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(450);
  }
}

await dismissModals();

// Atlas → Web Pentesting region.
await page.keyboard.press("1");
await page.waitForTimeout(500);
await dismissModals(); // briefing can re-mount after navigation
await page.getByRole("button", { name: /web pentesting/i }).click();
await page.waitForSelector("[data-zone-star]");
await page.waitForTimeout(1500);

await page.screenshot({ path: resolve(outDir, "region-web.png") });

// Grab each zone star's id + screen position.
const stars = await page.evaluate(() => {
  const out = [];
  for (const g of document.querySelectorAll("[data-zone-star]")) {
    const r = g.getBoundingClientRect();
    // Zone id is rendered as one of the <text> children; find it.
    let id = null;
    for (const t of g.querySelectorAll("text")) {
      const txt = t.textContent?.trim() ?? "";
      if (/^Z\d+$/.test(txt)) {
        id = txt;
        break;
      }
    }
    out.push({ id, x: r.left + r.width / 2, y: r.top + r.height / 2 });
  }
  return out;
});

// Group stars by approximate row (within 60px of each other vertically),
// then within each row sort left-to-right. Reading order should match
// numeric Z01 → Z02 → … → Z23.
stars.sort((a, b) => a.y - b.y || a.x - b.x);
const rows = [];
for (const s of stars) {
  const last = rows[rows.length - 1];
  if (last && Math.abs(last[0].y - s.y) < 60) last.push(s);
  else rows.push([s]);
}
for (const row of rows) row.sort((a, b) => a.x - b.x);
const order = rows.flat().map((s) => s.id);

console.log(`stars in reading order: ${order.join(" → ")}`);

// Assert ordering: Z01, Z02, ..., Z23 (skipping any that didn't render
// with a numeric id).
const expected = order
  .filter((id) => id !== null)
  .slice()
  .sort((a, b) => {
    const an = Number(a.replace(/\D/g, ""));
    const bn = Number(b.replace(/\D/g, ""));
    return an - bn;
  });

const actualNumeric = order.filter((id) => id !== null);
const inOrder = actualNumeric.every((id, i) => id === expected[i]);

if (!inOrder) {
  console.error(`expected: ${expected.join(" → ")}`);
  console.error(`actual:   ${actualNumeric.join(" → ")}`);
  process.exit(1);
}

console.log(`✓ all ${actualNumeric.length} zones in numeric order`);

await page.close();
await ctx.close();
await browser.close();
