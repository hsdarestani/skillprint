import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("raw Cloudflare Pages entrypoint can run without Vite transformer", () => {
  const html = readFileSync("index.html", "utf8");
  const main = readFileSync("src/main.js", "utf8");
  assert.match(html, /href="\/src\/style\.css"/);
  assert.match(html, /type="module" src="\/src\/main\.js"/);
  assert.doesNotMatch(main, /import\s+["'][^"']+\.css["']/);
  assert.doesNotMatch(main, /import\.meta\.env\.VITE_SKILLPRINT_API_BASE/);
  assert.match(main, /https:\/\/skillprint-live-api\.hsdf7rb\.workers\.dev/);
});
