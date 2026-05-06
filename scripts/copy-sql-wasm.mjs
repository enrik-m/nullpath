/**
 * Copies the sql.js WASM payload from node_modules to public/ so Vite
 * (dev) and Vercel (prod) can serve it as a static asset at a stable
 * URL. Runs as `predev` and `prebuild`.
 *
 * Why not commit the binary? It's 660 kB and changes whenever sql.js
 * upgrades — better to keep it derived from the installed dep.
 */

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const src = resolve(root, "node_modules/sql.js/dist/sql-wasm.wasm");
const destDir = resolve(root, "public");
const dest = resolve(destDir, "sql-wasm.wasm");

if (!existsSync(src)) {
  console.error(`[copy-sql-wasm] missing source: ${src}`);
  console.error(`[copy-sql-wasm] run \`npm install\` first`);
  process.exit(1);
}

if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

copyFileSync(src, dest);
console.log(`[copy-sql-wasm] ${src} → ${dest}`);
