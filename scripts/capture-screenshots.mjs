/**
 * Capture marketing screenshots of every major view in Nullpath.
 *
 * Usage:
 *   1. Install Chromium for Playwright (one-time):
 *        npx playwright install chromium
 *   2. Start the dev server in one terminal:
 *        npm run dev
 *   3. In another terminal, run:
 *        npm run capture:screenshots
 *   4. Output lands in docs/screenshots/*.png
 *
 * The script first seeds the local IndexedDB with completed nodes /
 * a few resources / a couple of bounties so the captured Stats and
 * Trophy Room screenshots aren't all empty-state. The seed is
 * deterministic — re-running gives you the same screenshots.
 *
 * Keep an eye on the Vite dev port — Vite bumps to 1421/1422 if 1420
 * is taken, set NULLPATH_URL to override the default.
 */

import { mkdirSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const outDir = resolve(root, "docs/screenshots");

if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const BASE = process.env.NULLPATH_URL ?? "http://localhost:1420";
const VIEWPORT = { width: 1440, height: 900 };

async function seedProgress(page) {
  // Wait for the boot sequence to settle and the DB to be ready.
  await page.waitForTimeout(3000);

  await page.evaluate(async () => {
    // The dev server lets us import source TS at runtime.
    const db = await import("/src/db/index.ts");
    const all = await db.getAllNodes();

    // Mark every 4th node complete (~205 nodes); every 6th in progress
    // (~137). Use a fixed pattern instead of randomness so screenshots
    // are stable across runs.
    for (let i = 0; i < all.length; i++) {
      const n = all[i];
      if (i % 4 === 0) {
        await db.setNodeStatus(n.id, "complete");
        await db.setNodeXp(n.id, 120);
        await db.recordCompletionDay();
      } else if (i % 6 === 0) {
        await db.setNodeStatus(n.id, "in_progress");
      }
    }

    // A few resources on completed nodes
    const completed = (await db.getAllNodes()).filter((n) => n.status === "complete");
    const kinds = ["video", "blog", "writeup", "lab", "tool"];
    const titles = [
      "PortSwigger Academy",
      "HackTricks — JWT",
      "Black Hat 2024 talk",
      "ippsec walkthrough",
      "Burp extension docs",
      "Practical Pentest Labs",
      "OWASP Cheat Sheet",
      "0x00sec post",
    ];
    for (let i = 0; i < Math.min(8, completed.length); i++) {
      await db.addResource({
        node_id: completed[i].id,
        kind: kinds[i % kinds.length],
        title: titles[i % titles.length],
        url: "https://example.com",
      });
    }

    // A note on one node so the operator card gets a "long note" feel.
    if (completed[0]) {
      await db.upsertNote(
        completed[0].id,
        [
          "Used the time-based blind technique.",
          "Payload: ' AND SLEEP(5)-- with a trailing comment to neutralize the closing quote.",
          "Confirmed via 5s response delay.",
          "",
          "Followups:",
          "- try CASE WHEN to leak booleans",
          "- check for second-order injection",
          "- look at insertion points for the same parameter elsewhere",
        ].join("\n"),
      );
    }

    // Two bounty submissions
    await db.addBounty({
      program: "HackerOne — AcmeCorp",
      title: "IDOR in /api/v2/users — cross-tenant data read",
      severity: "high",
      status: "accepted",
      payout_usd: 1500,
    });
    await db.addBounty({
      program: "Bugcrowd — DemoApp",
      title: "Stored XSS via filename in upload",
      severity: "medium",
      status: "resolved",
      payout_usd: 400,
      cve_id: "CVE-2026-12345",
    });
  });

  // Reload so dataVersion-bound views pick up the seeded state.
  await page.reload();
  await page.waitForTimeout(2500);
}

async function shoot(page, slug) {
  const path = resolve(outDir, `${slug}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`[screenshots] ${slug} → ${path.replace(root, ".")}`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: VIEWPORT,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();

console.log(`[screenshots] target ${BASE}`);
await page.goto(BASE);

console.log("[screenshots] seeding progress...");
await seedProgress(page);

// 1. Atlas — three region tiles
await page.keyboard.press("1");
await page.waitForTimeout(1500);
await shoot(page, "01-atlas");

// 2. Region (web) — click into the unlocked Web region tile
await page.locator("text=WEB PENTESTING").click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2500);
await shoot(page, "02-region-web");

// 3. Zone graph — click the first zone star (Z01).
await page
  .locator("[data-zone-star]")
  .first()
  .click({ timeout: 5000 })
  .catch(() => {});
await page.waitForTimeout(2500);
await shoot(page, "03-zone-graph");

// 4. Stats — operator card visible on the right
await page.keyboard.press("3");
await page.waitForTimeout(2000);
await shoot(page, "04-stats");

// 5. Trophy Room
await page.keyboard.press("5");
await page.waitForTimeout(1500);
await shoot(page, "05-trophy-room");

// 6. Codex
await page.keyboard.press("2");
await page.waitForTimeout(1500);
await shoot(page, "06-codex");

// 7. Bounties
await page.keyboard.press("4");
await page.waitForTimeout(1500);
await shoot(page, "07-bounties");

await browser.close();
console.log(`[screenshots] done — ${outDir.replace(root, ".")}`);
