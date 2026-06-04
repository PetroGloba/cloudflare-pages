#!/usr/bin/env node
/**
 * CSP regression check for store site front-end.
 * Fails on inline HTML attributes forbidden by strict CSP (style-src-attr, script-src unsafe-inline).
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const FILES = {
  source: join(root, "src/store-app.js"),
  bundle: join(root, "static/app.bundle.js"),
};

/** Patterns for inline HTML attributes (not DOM .style / .onclick assignments). */
const RULES = [
  {
    id: "style-attr",
    re: /style="/g,
    desc: 'inline style="..." attribute in HTML string',
  },
  {
    id: "onerror-attr",
    re: /onerror\s*=/g,
    desc: "inline onerror= handler in HTML string",
  },
  {
    id: "onclick-attr",
    re: /(?:^|[\s>'"])onclick\s*=/gm,
    desc: "inline onclick= handler in HTML string",
  },
];

const sourceOnly = process.argv.includes("--source-only");

function checkFile(filePath, label) {
  if (!existsSync(filePath)) {
    console.error(`[check-csp] missing ${label}: ${filePath}`);
    return [{ file: label, line: 0, rule: "missing-file", snippet: filePath }];
  }

  const text = readFileSync(filePath, "utf8");
  const lines = text.split("\n");
  const violations = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      if (rule.re.test(line)) {
        violations.push({
          file: label,
          line: i + 1,
          rule: rule.id,
          desc: rule.desc,
          snippet: line.trim().slice(0, 120),
        });
      }
    }
  }

  return violations;
}

const targets = sourceOnly
  ? [{ path: FILES.source, label: "src/store-app.js" }]
  : [
      { path: FILES.source, label: "src/store-app.js" },
      { path: FILES.bundle, label: "static/app.bundle.js" },
    ];

const all = targets.flatMap(({ path, label }) => checkFile(path, label));

if (all.length === 0) {
  const checked = targets.map((t) => t.label).join(", ");
  console.log(`[check-csp] pass — no forbidden inline HTML attributes (${checked})`);
  process.exit(0);
}

console.error("[check-csp] fail — forbidden inline HTML attributes found:\n");
for (const v of all) {
  console.error(
    `  ${v.file}:${v.line} [${v.rule}] ${v.desc}\n    ${v.snippet}${v.snippet.length >= 120 ? "…" : ""}\n`,
  );
}
process.exit(1);
