/**
 * Read-only check of the split-brew fix in components/palate/BrewDetail.
 *
 * A split session is one physical cup rated by two people. The per-taster tabs
 * used to drive only the read view, so opening the edit sheet always acted on
 * whichever row was passed in — you could be looking at taster B and rewriting
 * taster A. This opens a split, edits from each tab in turn, and prints the name
 * the edit sheet's rating block is addressed to. The two must differ.
 *
 * Requires `npm run dev` on :3000. Never saves.
 * Run: SHOT_DIR=./audit node scripts/verify/verify-split-tab.mjs
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const DIR = process.env.SHOT_DIR || "./audit";
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

const shot = async (p, n) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/${n}.png`, fullPage: true });
};

const closeSheet = async (p) => {
  for (let i = 0; i < 4; i++) {
    const b = p.locator(".sheet-backdrop").last();
    if (!(await b.isVisible().catch(() => false))) break;
    await b.click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await p.waitForTimeout(600);
  }
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
await p.locator("button").filter({ hasText: "Log" }).last().click();
await p.waitForTimeout(1500);

const cards = p.locator(".card");
const n = await cards.count();

// Find a split: its detail view carries the Segmented taster control.
let splitIdx = -1, tabs = [];
for (let i = 0; i < Math.min(n, 40); i++) {
  await cards.nth(i).click();
  await p.waitForTimeout(900);
  const edit = p.locator("button:has-text('Edit this brew')").first();
  if (!(await edit.isVisible().catch(() => false))) { await closeSheet(p); continue; }
  // The Segmented sits directly above the rating block; two sibling tab buttons.
  const seg = p.locator("button:has-text('Min-Taec')");
  if ((await seg.count()) > 0) {
    const all = await p.locator(".sheet button, [class*=sheet] button").allInnerTexts().catch(() => []);
    tabs = all.map((t) => t.trim()).filter((t) => t && !/Edit this brew|Delete|Rate this brew/i.test(t));
    splitIdx = i;
    break;
  }
  await closeSheet(p);
}

if (splitIdx < 0) { console.log("no split brew found in the first 40 cards"); await browser.close(); process.exit(1); }
console.log(`split at card ${splitIdx}; tab candidates: ${JSON.stringify(tabs)}`);

/** Enter the edit sheet and read the name its rating block is addressed to. */
async function editorNameFromTab(tabLabel) {
  await p.locator(`button:has-text("${tabLabel}")`).first().click();
  await p.waitForTimeout(600);
  await p.locator("button:has-text('Edit this brew')").first().click();
  await p.waitForTimeout(900);
  await shot(p, `v-split-tab-${tabLabel.replace(/\W+/g, "-")}`);
  // The rating card's first row is "<name>  ★★★★★".
  const body = await p.locator("body").innerText();
  const m = body.match(/RATING\s*\n\s*([^\n]+)/i);
  // Step back to the detail view without discarding the brew selection.
  await p.locator("[aria-label='Close']").first().click().catch(() => {});
  await p.waitForTimeout(700);
  return m ? m[1].trim() : "(not found)";
}

const names = [];
for (const t of tabs.slice(0, 2)) names.push([t, await editorNameFromTab(t)]);

console.log("\ntab → name the edit sheet rates:");
for (const [tab, name] of names) console.log(`  ${tab.padEnd(12)} → ${name}`);
const distinct = new Set(names.map(([, n2]) => n2)).size;
console.log(distinct === names.length
  ? "\nPASS — each tab edits its own taster's row"
  : "\nFAIL — both tabs resolve to the same row");

await browser.close();
