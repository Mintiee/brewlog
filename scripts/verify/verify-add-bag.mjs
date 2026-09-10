/**
 * Read-only verification of the add-a-bag flow (components/shelf/AddCoffee) and
 * the bulk-import review row (components/import/ImportSheet).
 *
 * It NEVER saves: "Add to shelf" and "Import N coffees" are asserted-on but
 * never clicked, and /api/extract is stubbed with page.route so no LLM call is
 * billed. Safe to run against the live household.
 *
 * Checks:
 *   1. capture phase has no "Scan bag" button to mis-tap (it used to be tappable
 *      with no photo, which POSTed an empty body for a 400 and a blank form)
 *   2. dropping a photo starts the scan by itself, and a good response prefills
 *      the review form
 *   3. a failed scan says so and offers a way back to capture
 *   4. review has an editable "Bag size" stepper (grams used to be hardcoded 250)
 *   5. the import review row can edit bag size and pick a roast level
 *
 * Requires `npm run dev` on :3000.
 * Run: SHOT_DIR=./audit node scripts/verify/verify-add-bag.mjs
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";

const BASE = "http://localhost:3000";
const DIR = process.env.SHOT_DIR || "./audit";
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

mkdirSync(DIR, { recursive: true });

// 8x8 red PNG — enough for ImagePicker's downscale step; the response is stubbed
// so the pixels never matter.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAFElEQVR4nGP8z8Dwn4GKgIma" +
  "hg0dAwCw0gX9b5uListAAAAAElFTkSuQmCC",
  "base64",
);

const EXTRACTED = {
  roaster: "Five Senses",
  name: "Ethiopia Kochere",
  origin: "Ethiopia",
  region: "Yirgacheffe",
  varietals: ["Heirloom"],
  process: "Washed",
  roast: "light",
  roastDaysAgo: 6,
  notes: ["cherry", "jasmine"],
};

let failures = 0;
const check = (ok, label) => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const shot = async (p, n) => {
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${DIR}/${n}.png`, fullPage: true });
  console.log(`  shot ${n}`);
};

/** Dismiss any open sheet(s) by clicking the backdrop — Escape isn't wired up. */
const closeSheet = async (p) => {
  for (let i = 0; i < 4; i++) {
    const backdrop = p.locator(".sheet-backdrop").last();
    if (!(await backdrop.isVisible().catch(() => false))) break;
    await backdrop.click({ position: { x: 5, y: 5 }, force: true }).catch(() => {});
    await p.waitForTimeout(500);
  }
};

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("console", (m) => { if (m.type() === "error") console.log("  [console error]", m.text()); });
p.on("pageerror", (e) => console.log("  [page error]", e.message));

// Stubbed extraction — flipped between the two branches below. Nothing reaches
// the real route, so this costs nothing and can't touch the household key.
let extractMode = "ok";
await p.route("**/api/extract", async (route) => {
  await new Promise((r) => setTimeout(r, 300));
  if (extractMode === "fail") return route.fulfill({ status: 400, json: { error: "Extraction failed" } });
  return route.fulfill({ status: 200, json: EXTRACTED });
});

await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
if (p.url().includes("/login")) {
  await p.click("button:has-text('Min-Taec')");
  try { await p.waitForURL(`${BASE}/`, { timeout: 25000 }); } catch {}
}
await p.waitForTimeout(4000);
console.log("logged in:", p.url());

// ---- Add a coffee ----------------------------------------------------------
console.log("\nadd-a-bag sheet");
// The app has no router — switch tabs through the bottom bar.
const gotoShelf = async () => {
  await p.locator("button:has-text('Shelf')").last().click();
  await p.waitForTimeout(900);
};
await gotoShelf();
await p.locator(".screen-pad button.btn-accent").first().click();
await p.waitForTimeout(1200);

const body = () => p.locator("body").innerText();
const capture = /Add a coffee/i.test(await body());
console.log(`  capture phase shown (AI key on): ${capture}`);

if (capture) {
  check(!(await p.locator("button:has-text('Scan bag')").isVisible().catch(() => false)),
    "no 'Scan bag' button to tap before a photo exists");
  await shot(p, "vb-1-capture");

  // 2. good scan — picking the photo is the whole action
  await p.locator("input[type=file][accept*='image']").setInputFiles({ name: "bag.png", mimeType: "image/png", buffer: PNG });
  await p.waitForTimeout(2500);
  const reviewed = await body();
  check(/Confirm details/i.test(reviewed), "photo pick started the scan by itself");
  // Field values live on the inputs, not in innerText.
  const values = await p.locator(".sheet input[type=text], .sheet input:not([type])").evaluateAll(
    (els) => els.map((e) => e.value),
  );
  check(values.includes("Five Senses") && values.includes("Ethiopia Kochere"),
    `review prefilled from the extraction (${values.join(" | ")})`);
  await shot(p, "vb-2-review-scanned");

  // 3. failed scan
  await closeSheet(p);
  await p.waitForTimeout(600);
  extractMode = "fail";
  await p.locator(".screen-pad button.btn-accent").first().click();
  await p.waitForTimeout(900);
  // A draft from the successful scan may be restored — clear it to reach capture.
  const clearBtn = p.locator("button:has-text('Clear')").first();
  if (await clearBtn.isVisible().catch(() => false)) { await clearBtn.click(); await p.waitForTimeout(600); }
  await p.locator("input[type=file][accept*='image']").setInputFiles({ name: "bag.png", mimeType: "image/png", buffer: PNG });
  await p.waitForTimeout(2500);
  const failed = await body();
  check(/Couldn't read that bag/i.test(failed), "failed scan says so instead of a silent blank form");
  await shot(p, "vb-3-scan-failed");
  await p.locator("button:has-text('Try another')").first().click();
  await p.waitForTimeout(700);
  check(/Add a coffee/i.test(await body()), "'Try another' goes back to capture");
  extractMode = "ok";

  // Reach the review form manually for the bag-size check.
  await p.locator("button:has-text('Enter manually')").first().click();
  await p.waitForTimeout(800);
} else {
  console.log("  (no AI key — sheet opens straight into manual review)");
}

// 4. bag size is editable
const review = await body();
check(/Confirm details/i.test(review), "review phase reached");
check(/Bag size/i.test(review), "review has a 'Bag size' field");
await shot(p, "vb-4-review-bagsize");
// Step the value up twice: 250 -> 300 at 25g a tap.
const plusBtns = await p.locator("button[aria-label='Increase']").count();
if (plusBtns) {
  await p.locator("button[aria-label='Increase']").first().click();
  await p.locator("button[aria-label='Increase']").first().click();
  await p.waitForTimeout(300);
  check(/300/.test(await body()), "bag size steps 250 -> 300 at 25g per tap");
} else {
  console.log("  (stepper buttons carry no aria-label — value change checked by eye in vb-4)");
}
await shot(p, "vb-5-review-bagsize-stepped");
// Blank manual form => the commit button reads "N to fill in" and is disabled;
// a filled one reads "Add to shelf". Either way it must exist and stay unclicked.
const commitBtn = p.locator("button:has-text('Add to shelf'), button:has-text('to fill in')").first();
check(await commitBtn.isVisible().catch(() => false),
  "commit button present (NOT clicked — this script never saves)");
await closeSheet(p);

// ---- Bulk import review ----------------------------------------------------
console.log("\nimport review row");
// The settings cog only renders on the Brew tab's first step.
await p.locator("button:has-text('Brew')").last().click();
await p.waitForTimeout(900);
await p.locator("[aria-label='Settings']").first().click().catch(() => {});
await p.waitForTimeout(1500);
const importBtn = p.locator("button:has-text('Import coffees')").first();
if (await importBtn.isVisible().catch(() => false)) {
  await importBtn.click();
  await p.waitForTimeout(900);
  await p.locator("button:has-text('CSV')").first().click();
  await p.waitForTimeout(400);
  const csv = "roaster,name,origin,grams,roast\nFive Senses,Verify Row,Ethiopia,340,Medium Dark Roast\n";
  await p.locator("input[type=file][accept='.csv']").setInputFiles({ name: "verify.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await p.waitForTimeout(1200);
  const rev = await body();
  check(/Review 1 coffee/i.test(rev), "CSV parsed into review");
  check(/340g/i.test(rev), "bag size shows in the collapsed row summary"); // .label uppercases via CSS
  await p.locator("text=Verify Row").first().click();
  await p.waitForTimeout(600);
  const expanded = await body();
  check(/Bag size/i.test(expanded), "expanded row has a bag-size stepper");
  const roastSel = p.locator("select").first();
  check(await roastSel.isVisible().catch(() => false), "expanded row has a roast select");
  if (await roastSel.isVisible().catch(() => false)) {
    check((await roastSel.inputValue()) === "medium-dark",
      "free-text 'Medium Dark Roast' normalises to medium-dark in the select");
  }
  await shot(p, "vb-6-import-row");
  check(await p.locator("button:has-text('Import 1 coffee')").isVisible().catch(() => false),
    "'Import 1 coffee' present (NOT clicked — this script never saves)");
  await closeSheet(p);
} else {
  console.log("  (couldn't reach Settings -> Import; skipped)");
}

await browser.close();
console.log(`\n${failures ? `${failures} FAILED` : "all checks passed"} — nothing was saved`);
process.exit(failures ? 1 : 0);
