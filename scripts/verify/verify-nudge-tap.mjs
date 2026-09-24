/**
 * Read-only check that tapping a push nudge lands on the right screen, by every
 * path a tap can take (see docs/notifications.md, "Deep links"):
 *
 *   A. warm + postMessage: the real notificationclick handler in sw.js, fired
 *      inside the live service worker against an open window
 *   B. mailbox only: the entry the worker writes, with no message and no URL.
 *      This is what an iOS home-screen app resumed by a tap actually gets.
 *   C. a stale mailbox entry is ignored
 *   D. a remount after a tab switch doesn't reopen a handled sheet
 *   E. cold open from the launch URL (/?rate=<id>), with the query stripped
 *   F. a days-old seed (as the worker's cached shell serves) refreshes on boot,
 *      and a fresh one doesn't
 *
 * It opens the rating sheet only ("How was it?") and never saves, so nothing is
 * written. The nudge's refresh is a read.
 *
 * Requires `npm run dev` on :3000.
 * Run: node scripts/verify/verify-nudge-tap.mjs
 */
import { chromium } from "@playwright/test";

const BASE = "http://localhost:3000";
const MOBILE = { width: 390, height: 844 };
const SHEET = "How was it?";

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);
  if (!ok) failed++;
};

// Check F rewrites the page HTML via route interception. Chromium treats an
// intercepted document as public, and its local-network-access checks then block
// its own chunk requests to localhost, so it never hydrates. This test-only
// browser turns those checks off.
const browser = await chromium.launch({
  headless: true,
  args: ["--disable-features=LocalNetworkAccessChecks,PrivateNetworkAccessChecks"],
});
const ctx = await browser.newContext({ viewport: MOBILE, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("  [page error]", e.message));

const sheetOpen = async (waitMs = 4000) => {
  try {
    await p.getByText(SHEET).first().waitFor({ state: "visible", timeout: waitMs });
    return true;
  } catch {
    return false;
  }
};
const home = async () => {
  await p.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await p.getByRole("button", { name: /^Shelf$/i }).first().waitFor({ timeout: 30000 });
  await p.waitForTimeout(1500);
};

// --- sign in (same flow as the other verify scripts) ---
await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await p.waitForTimeout(1500);
if (p.url().includes("/login")) {
  await p.click("button:has-text('Min-Taec')");
  try { await p.waitForURL(`${BASE}/`, { timeout: 25000 }); } catch {}
}
await home();

// Wait for the worker to control this page. Reload once if it activated after load.
await p.evaluate(() => navigator.serviceWorker.ready);
if (!(await p.evaluate(() => !!navigator.serviceWorker.controller))) await home();
check("page is controlled by the service worker", await p.evaluate(() => !!navigator.serviceWorker.controller));

// A real brew id, from the prefetched payload serialised into the page.
const brewId = await p.evaluate(() => {
  const html = document.documentElement.innerHTML;
  const at = html.indexOf("brews");
  const m = html.slice(at).match(/id\\*":\\*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/);
  return m ? m[1] : null;
});
if (!brewId) { console.log("no brew id found in page payload"); await browser.close(); process.exit(1); }
console.log(`brew id: ${brewId}`);

const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));

// --- A. warm: fire the worker's own notificationclick handler ---
check("A: sheet closed before the tap", !(await sheetOpen(500)));
// Headless Chromium can't grant notification permission, so there is no real
// Notification to click. The handler only reads event.notification.{close,data}
// and calls waitUntil, so a stand-in notification on an ExtendableEvent still
// exercises the worker's real code.
const dispatched = await sw.evaluate((url) => {
  const e = new ExtendableEvent("notificationclick");
  Object.defineProperty(e, "notification", { value: { close() {}, data: { url } } });
  self.dispatchEvent(e);
  return "ok";
}, `/?rate=${brewId}`);
check("A: notificationclick dispatched in the worker", dispatched === "ok", dispatched);
check("A: rating sheet opened (message path)", await sheetOpen());
await p.waitForTimeout(800);
check("A: mailbox cleared after handling", await p.evaluate(async () =>
  !(await (await caches.open("brewlog-intent")).match("/__nudge-intent"))));

// --- B. mailbox only: no message, no URL, just a foreground event ---
await home();
check("B: sheet closed after reload (tap not replayed)", !(await sheetOpen(1500)));
await p.evaluate(async (url) => {
  const c = await caches.open("brewlog-intent");
  await c.put("/__nudge-intent", new Response(JSON.stringify({ id: `verify-${Date.now()}`, url, at: Date.now() })));
  document.dispatchEvent(new Event("visibilitychange"));
}, `/?rate=${brewId}`);
check("B: rating sheet opened (mailbox path)", await sheetOpen());

// --- D. tab switch and back must not reopen it ---
await p.getByRole("button", { name: /^Shelf$/i }).first().click();
await p.waitForTimeout(800);
await p.getByRole("button", { name: /^Brew$/i }).first().click();
check("D: not reopened after remount", !(await sheetOpen(2500)));

// --- C. a stale entry is ignored ---
await home();
await p.evaluate(async (url) => {
  const c = await caches.open("brewlog-intent");
  await c.put("/__nudge-intent", new Response(JSON.stringify({ id: "verify-stale", url, at: Date.now() - 60 * 60 * 1000 })));
  window.dispatchEvent(new Event("focus"));
}, `/?rate=${brewId}`);
check("C: stale mailbox entry ignored", !(await sheetOpen(2500)));

// --- E. cold open from the launch URL ---
await p.goto(`${BASE}/?rate=${brewId}`, { waitUntil: "domcontentloaded" });
check("E: rating sheet opened (launch URL)", await sheetOpen(30000));
check("E: query stripped from the URL", !new URL(p.url()).search, p.url());

// --- F. an old seed (the worker's cached shell) refreshes on boot; a fresh one doesn't ---
const brewFetchesAfterBoot = async (ageMs) => {
  const ctx2 = await browser.newContext({ viewport: MOBILE, storageState: await ctx.storageState(), serviceWorkers: "block" });
  const q = await ctx2.newPage();
  await q.route(`${BASE}/`, async (route) => {
    const res = await route.fetch();
    const html = (await res.text()).replace(/(fetchedAt\\*":)(\d+)/g, (_, k, v) => `${k}${Number(v) - ageMs}`);
    // Fresh headers only: the original content-length/encoding describe the
    // unmodified body and would truncate or garble this one.
    await route.fulfill({ status: res.status(), contentType: "text/html; charset=utf-8", body: html });
  });
  let n = 0;
  q.on("request", (r) => { if (/\/rest\/v1\/brews/.test(r.url())) n++; });
  await q.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await q.getByRole("button", { name: /^Shelf$/i }).first().waitFor({ timeout: 30000 });
  await q.waitForTimeout(4000);
  await ctx2.close();
  return n;
};
const fresh = await brewFetchesAfterBoot(0);
const stale = await brewFetchesAfterBoot(3 * 24 * 60 * 60 * 1000);
check("F: fresh seed does not refetch brews on boot", fresh === 0, `${fresh} fetches`);
check("F: 3-day-old seed refetches brews on boot", stale > 0, `${stale} fetches`);

await browser.close();
console.log(failed ? `${failed} check(s) failed` : "all checks passed — nothing was written");
process.exit(failed ? 1 : 0);
