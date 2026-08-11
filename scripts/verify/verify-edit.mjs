/**
 * Read-only verification of the brew edit sheet (components/palate/BrewDetail).
 *
 * Opens journal cards, enters the edit sheet and screenshots it — it NEVER
 * saves, so it is safe to run against the live household. Confirms that every
 * field captured at log time is present and pre-filled when editing:
 * date, water type, grind/dose/water/temp (+ bypass on a bypass brewer),
 * stars, second taster, the four sensory scales and the tasting note.
 *
 * Requires `npm run dev` on :3000.
 * Run: SHOT_DIR=./audit node scripts/verify/verify-edit.mjs
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

/** Scroll the innermost scrollable element (the open sheet). */
const scrollSheet = async (p, y) => {
  await p.evaluate((to) => {
    const els = [...document.querySelectorAll("*")].filter((e) => e.scrollHeight > e.clientHeight + 40);
    const sheet = els[els.length - 1];
    if (sheet) sheet.scrollTop = to;
  }, y);
  await p.waitForTimeout(400);
};

/** Dismiss any open sheet(s) by clicking the backdrop — Escape isn't wired up,
 *  and the edit sheet's own X only steps back to the detail view. */
const closeSheet = async (p) => {
  for (let i = 0; i < 4; i++) {
    const backdrop = p.locator(".sheet-backdrop").last();
    if (!(await backdrop.isVisible().catch(() => false))) break;
    await backdrop.click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await p.waitForTimeout(600);
  }
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("  [console error]", m.text()); });
p.on("pageerror", (e) => console.log("  [page error]", e.message));

await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
if (p.url().includes("/login")) {
  await p.click("button:has-text('Min-Taec')");
  try { await p.waitForURL(`${BASE}/`, { timeout: 25000 }); } catch {}
}
await p.waitForTimeout(4000);
console.log("logged in:", p.url());

await p.locator("button").filter({ hasText: "Log" }).last().click();
await p.waitForTimeout(1500);

const cards = p.locator(".card");
const n = await cards.count();
console.log(`journal cards: ${n}`);

// Walk cards until each interesting shape has been captured once.
const want = { rated: false, bypass: false, split: false };
for (let i = 0; i < Math.min(n, 40) && !Object.values(want).every(Boolean); i++) {
  await cards.nth(i).click();
  await p.waitForTimeout(1000);

  const editBtn = p.locator("button:has-text('Edit this brew')").first();
  if (!(await editBtn.isVisible().catch(() => false))) {
    console.log(`  card ${i}: no detail sheet opened`);
    await closeSheet(p);
    continue;
  }

  const detail = await p.locator("body").innerText();
  const isRated = /\bRating\b/i.test(detail);
  // Only bypass brewers render an "After" cell in the read-only recipe grid.
  const isBypass = /\bAfter\b/i.test(detail);
  // A split renders the per-taster Segmented control above the rating block.
  const isSplit = await p.locator("button:has-text('Kris')").first().isVisible().catch(() => false);
  console.log(`  card ${i}: rated=${isRated} bypass=${isBypass} split=${isSplit}`);

  const capture = async (key, name, opts = {}) => {
    if (want[key]) return;
    await shot(p, `v-${name}-detail`);
    await editBtn.click();
    await p.waitForTimeout(1000);
    await shot(p, `v-${name}-edit-top`);
    await scrollSheet(p, opts.scroll ?? 900);
    await shot(p, `v-${name}-edit-bottom`);
    want[key] = true;
    await closeSheet(p);
  };

  if (isSplit) await capture("split", "split");
  else if (isBypass) await capture("bypass", "bypass");
  else if (isRated) await capture("rated", "rated");

  await closeSheet(p);
  await p.waitForTimeout(400);
}

console.log("captured:", want);
await browser.close();
console.log("done — nothing was saved");
