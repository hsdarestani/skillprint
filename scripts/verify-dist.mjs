import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Build smoke test: catching Cloudflare Pages publishing the wrong directory
// or silently leaving Vite source module paths in production HTML.
const dist = "dist";
const htmlPath = join(dist, "index.html");
assert.ok(existsSync(htmlPath), "Vite dist/index.html missing. Set Pages build command to npm run build and output to dist.");
const html = readFileSync(htmlPath, "utf8");
assert.ok(html.includes("SKILLPRINT LIVE"), "App HTML title missing.");
assert.ok(!html.includes('src="/src/main.js"'), "Raw Vite entrypoint remained: production assets were not built.");
const scripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"[^>]*><\/script>/g)].map(m => m[1]);
const css = [...html.matchAll(/<link[^>]*href="([^"]+\.css)"[^>]*>/g)].map(m => m[1]);
const visualAssets = [...html.matchAll(/<link[^>]*href="([^"]+\.(?:woff2|svg))"[^>]*>/g)].map(m => m[1]);
assert.ok(scripts.some(s => s.startsWith("/assets/")), "Built JS asset reference not found.");
assert.ok(css.some(s => s.startsWith("/assets/")), "Built CSS asset reference not found.");
for (const asset of [...scripts,...css,...visualAssets]) {
  assert.ok(asset.startsWith("/") && !asset.includes(".."), "Unexpected asset path");
  assert.ok(existsSync(join(dist, asset.slice(1))), "Missing built asset: " + asset);
}
assert.ok(existsSync(join(dist, "config.js")), "Public Worker configuration missing.");
console.log("OK — Pages artifact is complete; deploy exactly the dist/ directory.");
