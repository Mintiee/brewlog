/**
 * Read-only check that the log flow (StepWhat → StepHow) still renders after
 * RecipeFields / WaterTypeRow were extracted out of StepHow. Screenshots each
 * brewer tile's recipe card so a bypass brewer's "After" stepper is visible.
 * Stops before "Log coffee" — nothing is written.
 *
 * Requires `npm run dev` on :3000.
 * Run: SHOT_DIR=./audit node scripts/verify/verify-log-flow.mjs
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const DIR = process.env.SHOT_DIR || "./audit";
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const shot = async (p, n) => {
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${DIR}/${n}.png`, fullPage: true });
  console.log(`  shot ${n}`);
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  [page error]", e.message));

await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
if (p.url().includes("/login")) {
  await p.click("button:has-text('Min-Taec')");
  try { await p.waitForURL(`${BASE}/`, { timeout: 25000 }); } catch {}
}
await p.waitForTimeout(4000);

await shot(p, "v-log-home");

// Pick the first coffee to reach StepHow. The home list rows aren't `.card`,
// so match the roaster/name row by its button role instead.
const rows = p.locator("button, [role=button]");
const total = await rows.count();
console.log(`home buttons: ${total}`);
let opened = false;
for (let i = 0; i < total; i++) {
  const t = (await rows.nth(i).innerText().catch(() => "")).trim();
  if (!t || /^(Brew|Shelf|Log|Palate|Settings)$/i.test(t)) continue;
  console.log(`  trying row ${i}: ${JSON.stringify(t.slice(0, 40))}`);
  await rows.nth(i).click().catch(() => {});
  await p.waitForTimeout(1500);
  if (/How are you brewing/i.test(await p.locator("body").innerText())) { opened = true; break; }
}
if (!opened) { console.log("could not reach StepHow"); await shot(p, "v-log-stuck"); await browser.close(); process.exit(1); }
await shot(p, "v-log-how");

// Cycle the brewer tiles: each re-seeds the recipe, and a bypass brewer adds "After".
const tiles = p.locator("button").filter({ hasText: /^(V60|Gabi|OXO|Kalita|Switch)/i });
const count = await tiles.count();
console.log(`brewer tiles: ${count}`);
for (let i = 0; i < count; i++) {
  const label = (await tiles.nth(i).innerText()).trim().replace(/\s+/g, "-");
  await tiles.nth(i).click();
  await p.waitForTimeout(700);
  await shot(p, `v-log-how-${i}-${label}`);
  const body = await p.locator("body").innerText();
  // Case-insensitive: the stepper label renders uppercased via CSS-less markup.
  console.log(`  ${label}: bypass stepper ${/\bAfter\b/i.test(body) ? "PRESENT" : "absent"}`);
}

await browser.close();
console.log("done — nothing was logged");
