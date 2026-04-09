import * as esbuild from "esbuild";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes("--watch");
/** npm run build sets NODE_ENV=production; npm run watch leaves it unset so console/debugger stay for DX. */
const dropConsoleInBundle =
  process.env.NODE_ENV === "production" ? ["console", "debugger"] : [];

const apiBase =
  (process.env.STORE_API_ORIGIN || process.env.VITE_STORE_API_ORIGIN || "").trim();

const ctx = await esbuild.context({
  entryPoints: [join(__dirname, "src/main.js")],
  outfile: join(__dirname, "static/app.bundle.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  logLevel: "info",
  drop: dropConsoleInBundle,
  define: {
    API_BASE_URL: JSON.stringify(apiBase),
  },
});

if (watch) {
  await ctx.watch();
} else {
  await ctx.rebuild();
  await ctx.dispose();
}
