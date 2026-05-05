#!/usr/bin/env node
/**
 * build-seed.mjs
 * ---------------------------------------------------------------------------
 * Parses plans/web-pentesting.md (the unified web pentesting skill skeleton)
 * and emits src-tauri/migrations/002_seed_web.sql containing INSERTs for the
 * Web region, all zones, and every leaf/sub-leaf node.
 *
 * Re-run any time the plan file changes:
 *
 *     npm run seed:build
 *
 * The parser is deliberately tolerant: if a bullet doesn't match the expected
 * shape it's logged and skipped, never crashed.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const SOURCE = join(PROJECT_ROOT, "plans", "web-pentesting.md");
const OUT = join(PROJECT_ROOT, "src-tauri", "migrations", "002_seed_web.sql");

// ---------------------------------------------------------------------------
// Zone-prefix → kind map. Determines the `kind` column on every node in a zone.
// ---------------------------------------------------------------------------
const ZONE_KIND = {
  Z01: "foundation",
  Z02: "tool",
  Z03: "recon",
  Z04: "vuln",
  Z05: "vuln",
  Z06: "vuln",
  Z07: "vuln",
  Z08: "vuln",
  Z09: "vuln",
  Z10: "vuln",
  Z11: "vuln",
  Z12: "vuln",
  Z13: "vuln",
  Z14: "methodology",
  Z15: "vuln",
  Z16: "vuln",
  Z17: "vuln",
  Z18: "vuln",
  Z19: "vuln",
  Z20: "vuln",
  Z21: "defense",
  Z22: "methodology",
  Z23: "capstone",
};

// ---------------------------------------------------------------------------
// Layout: arrange the 23 zones on a stylized 2D map for the constellation
// view. Coordinates are in arbitrary units; the renderer scales them.
// Hand-tuned for visual balance — methodology + capstones flanking the
// vuln cluster, foundations top-left as the entry, tooling top-right.
// ---------------------------------------------------------------------------
const ZONE_LAYOUT = {
  Z01: { cx: -700, cy: -480 }, //  Foundations
  Z02: { cx:  700, cy: -480 }, //  Tooling
  Z03: { cx: -560, cy: -180 }, //  Recon
  Z04: { cx:    0, cy: -300 }, //  Injection
  Z05: { cx:  560, cy: -180 }, //  Client-Side
  Z06: { cx: -800, cy:   80 }, //  Auth
  Z07: { cx: -380, cy:    0 }, //  Access Control
  Z08: { cx:    0, cy:   60 }, //  Server-Side
  Z09: { cx:  380, cy:    0 }, //  HTTP/Cache
  Z10: { cx:  800, cy:   80 }, //  CSRF
  Z11: { cx: -240, cy:  300 }, //  API
  Z12: { cx:  240, cy:  300 }, //  Misconfig
  Z13: { cx:  640, cy:  340 }, //  Business Logic
  Z14: { cx: -640, cy:  340 }, //  Source Review
  Z15: { cx: -880, cy:  600 }, //  Supply Chain
  Z16: { cx: -440, cy:  600 }, //  Cloud-Native
  Z17: { cx:    0, cy:  600 }, //  WAF/CDN Bypass
  Z18: { cx:  440, cy:  600 }, //  Frontend Frameworks
  Z19: { cx:  880, cy:  600 }, //  Modern Browser
  Z20: { cx: -200, cy:  860 }, //  AI/LLM
  Z21: { cx:  200, cy:  860 }, //  Defenses
  Z22: { cx: -640, cy: -700 }, //  Methodology
  Z23: { cx:  640, cy: -700 }, //  Capstones
};

// ---------------------------------------------------------------------------
// SQL-escape: single-quote duplication, no NULL handling (callers wrap NULLs).
// ---------------------------------------------------------------------------
const sql = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return `'${String(v).replace(/'/g, "''")}'`;
};

// ---------------------------------------------------------------------------
// Markdown parser. Stateful: walks the file line-by-line tracking the
// current zone, current top-level node (parent for sub-nodes), etc.
// ---------------------------------------------------------------------------
function parse(md) {
  const lines = md.split(/\r?\n/);
  const zones = [];
  const nodes = [];

  // Match a zone heading line: "## Z04 — Injection Caves"
  const RX_ZONE = /^##\s+(Z\d{2})\s+[—\-]\s+(.+?)\s*$/;
  // Match a leaf bullet (top-level OR sub-node — distinguished by indent):
  //   "- **W01 SQL Injection** `[std]` `[OWASP A03 / CWE-89]` — server-side SQL injection"
  //   "  - **W01a Error-based** `[std]` — leak data via DBMS errors"
  const RX_LEAF = /^(\s*)-\s+\*\*([A-Za-z0-9]+(?:\s+[^*]+)?)\*\*(.*)$/;

  let currentZone = null;
  let currentZoneSortOrder = 0;
  let currentTop = null; // { id, sort } — most recently seen top-level node
  let nodeSortByZone = new Map(); // zone_id → counter for sort_order

  for (const line of lines) {
    const zm = line.match(RX_ZONE);
    if (zm) {
      const [, zid, zname] = zm;
      const layout = ZONE_LAYOUT[zid] || { cx: 0, cy: 0 };
      zones.push({
        id: zid,
        name: zname.replace(/`.*$/, "").trim(),
        sort_order: ++currentZoneSortOrder,
        cx: layout.cx,
        cy: layout.cy,
      });
      currentZone = zid;
      currentTop = null;
      continue;
    }

    if (!currentZone) continue;

    const m = line.match(RX_LEAF);
    if (!m) continue;

    const [, indent, idAndName, rest] = m;
    const isSubNode = indent.length >= 2;

    // Split idAndName: leading token (the ID) + the name.
    // Handles "W01 SQL Injection" → id="W01", name="SQL Injection"
    // Handles "F01 Networking — TCP/IP & OSI" → id="F01", name="Networking — TCP/IP & OSI"
    const idMatch = idAndName.match(/^([A-Za-z]+\d+[a-z]?)\s+(.+)$/);
    if (!idMatch) {
      console.warn(`[skip] couldn't parse id/name from: ${idAndName}`);
      continue;
    }
    const [, id, name] = idMatch;

    // Tags: backtick-wrapped fragments like `[std]`, `[OWASP A03 / CWE-89]`,
    // `[defense-to-bypass]`, `[capstone]`.
    let depth = "std";
    let owaspTag = null;
    let cweId = null;

    const tagMatches = [...rest.matchAll(/`\[([^\]]+)\]`/g)];
    for (const tm of tagMatches) {
      const tag = tm[1].trim();
      if (/^(intro|std|adv|res)$/i.test(tag)) {
        depth = tag.toLowerCase();
        continue;
      }
      // Combined OWASP/CWE tag: "OWASP A03 / CWE-89" or "OWASP A03"
      const owaspM = tag.match(/OWASP\s+(A\d+|API\d+|LLM\d+)/i);
      if (owaspM) owaspTag = owaspM[1].toUpperCase();
      const cweM = tag.match(/CWE-?(\d+)/i);
      if (cweM) cweId = `CWE-${cweM[1]}`;
    }

    // Gloss = post-tags trailing text after an em-dash or hyphen.
    let gloss = null;
    const dashSplit = rest.split(/\s+[—\-]\s+/);
    if (dashSplit.length > 1) {
      gloss = dashSplit.slice(1).join(" — ").trim();
      // Strip any leftover backtick tags from gloss
      gloss = gloss.replace(/`\[[^\]]+\]`/g, "").trim();
      if (!gloss) gloss = null;
    }

    const sortCounter = (nodeSortByZone.get(currentZone) || 0) + 1;
    nodeSortByZone.set(currentZone, sortCounter);

    let parentId = null;
    if (isSubNode && currentTop) {
      parentId = currentTop.id;
    }

    const kind = ZONE_KIND[currentZone] || "vuln";

    nodes.push({
      id,
      zone_id: currentZone,
      parent_id: parentId,
      name: name.trim(),
      gloss,
      kind,
      depth,
      owasp_tag: owaspTag,
      cwe_id: cweId,
      sort_order: sortCounter,
    });

    if (!isSubNode) {
      currentTop = { id, sort: sortCounter };
    }
  }

  return { zones, nodes };
}

// ---------------------------------------------------------------------------
// SQL emitter
// ---------------------------------------------------------------------------
function emit({ zones, nodes }) {
  const out = [];
  out.push("-- ==========================================================================");
  out.push("-- Nullpath — Web Pentesting region seed");
  out.push("-- Auto-generated from plans/web-pentesting.md by scripts/build-seed.mjs.");
  out.push("-- Do not edit by hand. Re-run `npm run seed:build` after editing the plan.");
  out.push("-- ==========================================================================");
  out.push("");
  out.push("BEGIN TRANSACTION;");
  out.push("");

  // Regions
  out.push("-- Regions");
  out.push(
    `INSERT INTO region (id, name, tagline, color_accent, sort_order, is_locked) VALUES
  ('web',           'Web Pentesting',          'OWASP, APIs, source review, supply chain, AI-backed apps', '#22d3ee', 1, 0),
  ('red-team',      'Red Teaming',             'Internal pentest, AD, C2, OPSEC',                            '#e879f9', 2, 1),
  ('vuln-research', 'Vuln Research / Exploit', 'RE, fuzzing, memory corruption, browser/kernel internals', '#fb7185', 3, 1);`
  );
  out.push("");

  // Zones
  out.push("-- Zones");
  out.push(
    "INSERT INTO zone (id, region_id, name, sort_order, cx, cy) VALUES"
  );
  zones.forEach((z, i) => {
    const tail = i === zones.length - 1 ? ";" : ",";
    out.push(
      `  (${sql(z.id)}, 'web', ${sql(z.name)}, ${z.sort_order}, ${z.cx}, ${z.cy})${tail}`
    );
  });
  out.push("");

  // Nodes — chunked by 100 to keep INSERT statements manageable
  out.push("-- Nodes");
  const CHUNK = 100;
  for (let i = 0; i < nodes.length; i += CHUNK) {
    const chunk = nodes.slice(i, i + CHUNK);
    out.push(
      "INSERT INTO node (id, zone_id, parent_id, name, gloss, kind, depth, owasp_tag, cwe_id, sort_order) VALUES"
    );
    chunk.forEach((n, idx) => {
      const tail = idx === chunk.length - 1 ? ";" : ",";
      out.push(
        `  (${sql(n.id)}, ${sql(n.zone_id)}, ${sql(n.parent_id)}, ${sql(n.name)}, ${sql(n.gloss)}, ${sql(n.kind)}, ${sql(n.depth)}, ${sql(n.owasp_tag)}, ${sql(n.cwe_id)}, ${n.sort_order})${tail}`
      );
    });
    out.push("");
  }

  out.push("COMMIT;");
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const md = readFileSync(SOURCE, "utf8");
const parsed = parse(md);
const sqlOut = emit(parsed);
writeFileSync(OUT, sqlOut, "utf8");

console.log(`✓ Parsed ${parsed.zones.length} zones and ${parsed.nodes.length} nodes`);
console.log(`✓ Wrote ${OUT}`);
