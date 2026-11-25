// Coverage gate: every /api/ path a view calls must have a decision in api.js.
// Usage: node tools/api-coverage.mjs [--list]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { resolve } from "../bundle/api.js";

const SRC = "bundle";
const CALL = /['"`](\/api\/[^'"`\s]*)['"`]/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (name === "vendor" || name === "node_modules" || name === "api.js") continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if ([".js", ".html"].includes(extname(name))) out.push(p);
  }
  return out;
}

const used = new Map();
for (const file of walk(SRC)) {
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(CALL)) {
    const p = m[1].split("?")[0];
    if (!used.has(p)) used.set(p, relative(SRC, file).replace(/\\/g, "/"));
  }
}

const byKind = new Map();
const missing = [];
for (const p of used.keys()) {
  const r = resolve(p);
  if (!r) missing.push(p);
  else byKind.set(r.kind, (byKind.get(r.kind) || 0) + 1);
}

const parts = ["tool", "llm", "job", "storage", "gone"]
  .filter((k) => byKind.has(k))
  .map((k) => `${k}=${byKind.get(k)}`);
console.log(`used=${used.size} ${parts.join(" ")} missing=${missing.length}`);
if (process.argv.includes("--list")) for (const p of missing) console.log(`  ${p}  (${used.get(p)})`);
process.exit(missing.length ? 1 : 0);
