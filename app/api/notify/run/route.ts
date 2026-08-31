/**
 * The nudge tick. Driven every 5 minutes by Supabase pg_cron via pg_net (not
 * Vercel Cron — the Hobby plan caps crons at once per day, ±59 min, which can't
 * drive a 25-minute rate nudge).
 *
 * DELIVERY IS AT-MOST-ONCE, ON PURPOSE. Every send is preceded by an atomic
 * claim, and a run that dies after claiming drops the nudge rather than sending
 * it twice. For a passive-notification product a duplicate is a worse failure
 * than a silence, and the in-app "waiting to rate" badge (AppShell.tsx) is
 * already the reliable backstop. Please don't "fix" this into send-then-stamp.
 *
 * The claim is released only for transient push failures (429/5xx), so the next
 * tick retries; a 400 stays claimed rather than spamming every five minutes.
 *
 * GET /api/notify/run?dryRun=1 returns every decision without claiming or
 * sending anything. That is the way to check this feature against real data.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/api/guards";
import { normName } from "@/lib/domain";
import { zoned, minutesToClock } from "@/lib/notify/tz";
import {
  learnSlots, needsRecompute, dueLogSlots, inRateQuietHours,
  RATE_CAP_PER_DAY,
} from "@/lib/notify/schedule";
import { fanOut, pushConfigured, type PushTarget } from "@/lib/notify/push";
import * as store from "@/lib/notify/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const LOOKBACK_MS = 56 * 86_400_000;

interface Decision {
  person: string;
  kind: "rate" | "log";
  detail: string;
  sent?: number;
  skipped?: string;
}

export async function GET(req: NextRequest) {
  const guard = requireCronSecret(req);
  if (!guard.ok) return guard.response;

  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  const nowMs = Date.now();
  const decisions: Decision[] = [];
  const deadEndpoints = new Set<string>();

  if (!pushConfigured() && !dryRun) {
    return NextResponse.json({ ok: false, error: "VAPID not configured" }, { status: 503 });
  }

  const subs = await store.listSubscriptions();
  if (subs.length === 0) return NextResponse.json({ ok: true, dryRun, decisions, note: "no subscriptions" });

  // Group devices by person. Several devices — and several stale profile rows
  // for the same human — fan into one person_key; one decision, N endpoints.
  const byPerson = new Map<string, { householdId: string; personKey: string; tz: string; targets: PushTarget[] }>();
  for (const s of subs) {
    const key = `${s.household_id}::${s.person_key}`;
    const entry = byPerson.get(key);
    const target: PushTarget = { endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth };
    if (entry) {
      entry.targets.push(target);
    } else {
      // Subscriptions come back most-recently-seen first, so the tz we adopt is
      // the one from the device this person actually used last — the phone that
      // travelled, not the laptop that didn't.
      byPerson.set(key, { householdId: s.household_id, personKey: s.person_key, tz: s.iana_tz, targets: [target] });
    }
  }

  const householdIds = [...new Set(subs.map((s) => s.household_id))];
  const [people, profiles, brews] = await Promise.all([
    store.listNotifyPeople(),
    store.profileNames(householdIds),
    store.brewTimes(householdIds, new Date(nowMs - LOOKBACK_MS).toISOString()),
  ]);
  const peopleByKey = new Map(people.map((p) => [`${p.household_id}::${p.person_key}`, p]));

  /** Every brew logged by this person, as epoch ms. */
  const brewsFor = (householdId: string, personKey: string) =>
    brews
      .filter((b) => b.household_id === householdId && normName(profiles.get(b.logged_by)?.name) === personKey)
      .map((b) => Date.parse(b.started_at));

  // ---------- log nudges ----------
  for (const [key, p] of byPerson) {
    const row = peopleByKey.get(key);
    const local = zoned(nowMs, p.tz);
    const mine = brewsFor(p.householdId, p.personKey);
    let slots = store.slotsOf(row);

    // Republish the learned times at most once per local day, before any window
    // opens — so the fire time is a constant all day and cannot flap tick to tick.
    if (needsRecompute(row?.slots_computed_on ?? null, p.tz, nowMs)) {
      slots = learnSlots(mine, p.tz, nowMs, slots);
      if (!dryRun) await store.saveSlots(p.householdId, p.personKey, slots, local.day);
      decisions.push({
        person: p.personKey,
        kind: "log",
        detail: `recomputed slots — morning ${describe(slots.morning)}, arvo ${describe(slots.arvo)}`,
      });
    }

    const due = dueLogSlots({
      slots,
      startedAtMs: mine,
      tz: p.tz,
      nowMs,
      enabled: row?.log_nudge !== false,
    });

    for (const slot of due) {
      if (dryRun) {
        decisions.push({ person: p.personKey, kind: "log", detail: `would nudge: ${slot}` });
        continue;
      }
      const claim = await store.claimLogNudge(p.householdId, p.personKey, local.day, slot);
      if (claim === null) {
        decisions.push({ person: p.personKey, kind: "log", detail: slot, skipped: "already claimed" });
        continue;
      }
      const res = await fanOut(p.targets, {
        title: slot === "morning" ? "Coffee this morning?" : "Arvo coffee?",
        body: "Nothing logged yet — tap if there's one to record.",
        url: "/?log=1",
        tag: `log-${slot}-${local.day}`,
      });
      res.gone.forEach((e) => deadEndpoints.add(e));
      if (res.retry) await store.releaseClaim(claim);
      decisions.push({ person: p.personKey, kind: "log", detail: slot, sent: res.sent, skipped: res.retry ? "released for retry" : undefined });
    }
  }

  // ---------- rate nudges ----------
  const candidates = await store.rateCandidates(nowMs);
  const claimable: typeof candidates = [];

  for (const b of candidates) {
    const ownerId = b.rate_for ?? b.logged_by; // mirrors ratingOwnerId()
    const ownerName = profiles.get(ownerId)?.name;
    if (!ownerName) continue; // unresolvable owner — skip, never guess
    const personKey = normName(ownerName);
    const key = `${b.household_id}::${personKey}`;
    const p = byPerson.get(key);
    if (!p) continue; // nobody subscribed for this person

    const row = peopleByKey.get(key);
    if (row?.rate_nudge === false) continue;
    if (inRateQuietHours(p.tz, nowMs)) {
      decisions.push({ person: personKey, kind: "rate", detail: b.id, skipped: "quiet hours" });
      continue;
    }
    const localDay = zoned(nowMs, p.tz).day;
    if (await store.countRateNudges(b.household_id, personKey, localDay) >= RATE_CAP_PER_DAY) {
      decisions.push({ person: personKey, kind: "rate", detail: b.id, skipped: "daily cap" });
      continue;
    }
    if (dryRun) {
      decisions.push({ person: personKey, kind: "rate", detail: `would nudge: ${store.coffeeOf(b)?.name ?? b.id}` });
      continue;
    }
    claimable.push(b);
  }

  if (claimable.length > 0) {
    const claimed = await store.claimRateNudges(claimable.map((b) => b.id));
    for (const b of claimable) {
      if (!claimed.has(b.id)) continue; // lost the race to a concurrent tick
      const personKey = normName(profiles.get(b.rate_for ?? b.logged_by)?.name);
      const p = byPerson.get(`${b.household_id}::${personKey}`)!;
      const localDay = zoned(nowMs, p.tz).day;
      const coffee = store.coffeeOf(b)?.name ?? "that brew";

      const res = await fanOut(p.targets, {
        title: `How was the ${coffee}?`,
        body: "Tap to add your rating while it's fresh.",
        url: `/?rate=${b.id}`,
        tag: `rate-${b.id}`,
      });
      res.gone.forEach((e) => deadEndpoints.add(e));
      if (res.retry) await store.releaseRateNudge(b.id);
      else await store.logRateNudge(b.household_id, personKey, localDay, b.id);
      decisions.push({ person: personKey, kind: "rate", detail: coffee, sent: res.sent, skipped: res.retry ? "released for retry" : undefined });
    }
  }

  if (!dryRun && deadEndpoints.size > 0) {
    await store.deleteSubscriptions([...deadEndpoints]);
  }

  return NextResponse.json({
    ok: true,
    dryRun,
    people: byPerson.size,
    pruned: deadEndpoints.size,
    decisions,
  });
}

function describe(s: { fireMin: number | null; active: boolean }): string {
  if (!s.active || s.fireMin === null) return "no pattern yet";
  return minutesToClock(s.fireMin);
}

/** pg_net posts, so accept POST as well as the GET used for manual debugging. */
export const POST = GET;
