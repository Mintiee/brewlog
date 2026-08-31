# Push nudges

Two notifications, both about the *record* rather than about brewing:

| Nudge | When | Opens |
|---|---|---|
| **Rate** | ~25 min after an unrated brew is logged | that brew's rating sheet |
| **Log** | at the time this person normally brews, if nothing is logged in that window | the brew flow |

This re-opens **P7 (PWA notifications)**, which `improvement-roadmap.md` had
parked as owner-rejected on AI-coaching grounds. The new rationale: these are
logistical prompts about the record, not brewing advice. Nothing here tells you
how to make coffee, and nothing fires before the time you'd normally already
have logged — see [The grace](#the-grace).

## Shape

```
pg_cron (*/5)  →  pg_net POST  →  /api/notify/run  →  lib/notify/schedule (pure)
                                                   →  lib/notify/db     (claims)
                                                   →  lib/notify/push   (web-push)
                                                   →  public/sw.js      (display + tap)
```

- `lib/notify/tz.ts` — IANA-zone wall-clock arithmetic (`zoned`, `isValidTz`).
- `lib/notify/schedule.ts` — the decision engine. **Pure**: no I/O, no `Date.now()`.
  Everything worth being confident about is tested here (`schedule.test.ts`).
- `lib/notify/db.ts` — service-role queries and the atomic claims.
- `lib/notify/push.ts` — `web-push` wrapper, outcomes not status codes.
- `lib/notify/client.ts` — permission, subscribe, and the per-open timezone refresh.
- `app/api/notify/run` — the tick. `app/api/notify/subscribe` — prefs and endpoints.
- `components/settings/Reminders.tsx` — the Settings section.

### Why pg_cron and not Vercel Cron

Vercel's **Hobby** plan caps crons at *once per day*, ±59 min, and rejects a more
frequent cron expression at deploy time. `pg_cron` is on Supabase's free tier and
runs at minute granularity. Setup lives in `supabase/cron/notify.sql`.

A side effect: the 5-minute heartbeat is database activity, so the project no
longer auto-pauses for inactivity.

## The two nudges resolve to different people

This is deliberate and easy to "simplify" by mistake:

| Nudge | Owner | Column |
|---|---|---|
| **Log** | the **brewer** | `logged_by` |
| **Rate** | the **drinker** | `rate_for ?? logged_by` (i.e. `ratingOwnerId`) |

Only the person holding the phone can log a cup, so the log nudge follows
whoever actually brews. But a cup is often brewed *for* the other member — the
log flow's `partner` and `split` audiences set `rate_for` on the row (see
`logCoffee` in `BrewFlow.tsx`) — and that cup is theirs to rate, so the rate
nudge follows the handoff.

Concretely, in this household: Min-Taec brews most of Kris's coffees. He gets
the "log a coffee?" nudge; she gets "how was it?" for the cups he made her. A
split creates two rows and each drinker is nudged for their own half.

The consequence to keep in mind: **the log nudge learns only from what a person
logs themselves.** A household routine shared between two loggers is scored
separately for each, and if neither individually clears the density gate, both
go quiet even though the household pattern is strong. That is the intended
trade — see the probe output below, where the household brews an arvo coffee on
31/56 days but no individual logger reaches 55%.

## Identity

Everything keys on `person_key = lower(btrim(profiles.name))` within a household,
never on `profile_id`. Anonymous re-logins mint duplicate same-name profile rows,
`profiles.id` cascades from `auth.users`, and a push subscription outlives all of
that — an id-keyed row would point at a dead identity while its endpoint is still
live, or vanish entirely when an old anon user is reaped.

`normName()` lives in `lib/domain/index.ts` next to `rateBelongsTo`, and both the
in-app "waiting to rate" badge and the push engine use it, so they cannot
disagree about whose brew a nudge is for.

Several devices and several stale profile rows fan into one `person_key`: one
decision, N endpoints.

## Timezone

`push_subscriptions.iana_tz`, re-sent from
`Intl.DateTimeFormat().resolvedOptions().timeZone` on every app open.

The rest of the app passes a client-sent numeric offset to the server
(`localDayAtOffset`). That is correct for classifying a timestamp moments after
it happened, and wrong here: this engine decides *when a future local wall-clock
moment occurs*, from a statistic learned across two months. An offset learned in
January is wrong from the first Sunday in April.

Scheduling uses the zone of the most recently seen device — the phone that
travelled, not the laptop that didn't.

## Learning the times

Nothing is user-configurable. The times come from each person's own brews.

**Sampling.** Non-guest brews they logged, over the last **56 days** (8 whole
weeks, so the sliding window never changes its weekday composition). Windows are
`morning = [04:00, 11:00)` and `arvo = [11:00, 17:00)` local. One sample per
(slot, local day): the **earliest** brew in that window. The nudge predicts the
*first* cup — averaging every brew would drag a two-coffee morning toward 09:30
and nudge someone who logged at 07:00.

<a id="the-grace"></a>
**The statistic.** `fire = median + 30 min`, snapped to the nearest 15.

The median (not the mean) so one 04:40 airport morning cannot move it. The +30
grace is the ethical load-bearing part: the nudge lands *after* the moment this
person would normally already have logged, so it only ever speaks when something
is unusual. A nudge at, say, the 25th percentile would be prompting someone to go
and make coffee, which is advice.

**The habit gate.** A slot is active only if all of:

| Gate | Threshold | Why |
|---|---|---|
| Density | brewed in that window on **≥55% of the 56-day lookback** | a missing brew is only notable if the routine is dense |
| Pulse | ≥6 of those days in the last 28 | a habit you dropped stops nudging |
| Sample | ≥15 samples | enough for a median to mean anything |
| Dispersion | `MAD ≤ 75 min` | a slot with no typical time can't have a nudge time |

The density gate is measured over the *whole* lookback rather than a short recent
window, so a fortnight away doesn't silence a years-old habit; the pulse check is
what handles genuinely abandoned ones.

55% is high on purpose, and it was set from real data rather than taste. At a
43% threshold the household's probe (below) activated an arvo slot for someone
who has an afternoon coffee 38% of the time — which would have nudged on the
majority of days. Roughly four false alarms a week is the opposite of chill.

**Fail any gate → the slot is silent, and no fallback time is invented.** Settings
says "not enough of a pattern yet". On this household's history that currently
means exactly one active slot — a 7:45am morning nudge for the person who brews
a morning coffee on two days in three, and silence for everything else. That is
the feature working.

**Stability.** Three mechanisms keep the time from wandering:

1. Slot times are *published* to `notify_person` once per local day (first tick
   after local 03:00), never recomputed per tick — so the fire time is a constant
   all day and cannot flap. A person who has never been computed is done on the
   next tick whatever the hour, so subscribing at 09:00 still gets an arvo slot.
2. Snapping to 15 minutes kills ±7 min wobble outright.
3. Hysteresis: a recomputed time is adopted only if it moved ≥20 min, and the
   gate must fail on **two** consecutive daily recomputes before a slot goes
   quiet — so one sick day doesn't flicker it off and back on.

## Claim before send

Every send is preceded by an atomic claim that can only succeed once. No claim,
no send. This is what makes overlapping or double-fired ticks free — there is no
advisory lock and no run table.

- **Log nudge** — the unique index on `notification_log` *is* the lock:
  `insert … on conflict do nothing returning id`. No row means someone else got there.
- **Rate nudge** — the conditional update is the lock:
  `update brews set rate_nudged_at = now() where id = any($1) and rate_nudged_at is null returning id`.

**Delivery is at-most-once, on purpose.** A run that dies after claiming drops the
nudge rather than sending it twice. For a passive-notification product a
duplicate is a worse failure than a silence, and the in-app pending badge
(`AppShell.tsx`) is already the reliable backstop. Please don't "fix" this into
send-then-stamp.

The claim is released only for transient push failures (429/5xx), so the next
tick retries. A 400 stays claimed rather than spamming every five minutes. A
404/410 deletes the subscription outright.

## Guardrails

| | |
|---|---|
| Rate quiet hours | none between local 22:00 and 06:00 |
| Rate cap | 2 per person per local day (counted off `notification_log`) |
| Log cap | structurally ≤2/day — one per window |
| Catch-up bound | a slot may only fire within 90 min of its time |
| Repeats | impossible; the claim is per (person, kind, local day, slot) |

The catch-up bound is what stops a Supabase project that was paused all morning
from waking at 14:00 and delivering the 07:45 nudge. A missed window stays missed.

## The offline-outbox trap

`lib/store/outbox.ts` replays a stored write verbatim, so a brew started at 09:00
with no signal lands hours later still carrying `started_at = 09:00`. Pushing
"rate your 09:00 brew?" at 3pm would be nonsense.

`brews.created_at` is server-authoritative — `default now()`, and never emitted by
`brewToRow`/`brewPatchToRow`. So the rate query adds
`created_at <= started_at + 20 min`: *it arrived before its own nudge time*. Late
drains are excluded from push entirely and simply appear in the in-app pending
badge, which is the honest outcome. (`rateGate()` in `lib/notify/db.ts` — the
cross-column comparison can't be expressed in PostgREST, so it runs in JS over a
handful of rows.)

Related trap: the trigger predicate is `rated_at is null`, **never** `stars is
null`. A brew deliberately resolved as unrated has `rated_at` set with `stars`
still null, and must not be dragged back into the queue. Note also that `pending`
is derived in `mappers.ts`, not a column — it cannot appear in SQL.

## Deep links

The app has no router; tabs and sheets are local state. So a notification carries
a URL (`/?rate=<brewId>` or `/?log=1`) which `AppShell` consumes once on mount
and then strips with `history.replaceState`, otherwise a refresh would reopen the
same sheet.

Two arrival paths funnel through the same `openNudge`:

- **Cold** — the URL the notification opened.
- **Warm** — `notificationclick` in `sw.js` prefers focusing an already-open
  window and `postMessage`s the route, because reopening would throw away
  in-progress state (a half-filled brew draft, the current tab).

`?rate=` sets `rateStart` on `BrewFlow`, which calls the pre-existing
`openRate(brew)`. No new rating UI was built.

## Operating it

**Before enabling anything**, see what the engine makes of the real history. This
is read-only — two SELECTs, no writes, no migration needed:

```bash
NUDGE_PROBE=1 npx vitest run lib/notify/probe.test.ts --pool=threads --disable-console-intercept
```

```
Nudge probe — Australia/Sydney, 122 non-guest brews in the last 56 days

  kris — 28 brews
      morning   8/56 days,  2/28 recent — silent (no clear pattern)
      arvo     15/56 days,  7/28 recent — silent (no clear pattern)
  min-taec — 94 brews
      morning  37/56 days, 14/28 recent — nudges at 7:45am
      arvo     21/56 days, 14/28 recent — silent (no clear pattern)

  rate routing — recent handed-off / split cups (brewer -> rater):
      2026-08-28  7:37am  partner min-taec -> kris
      2026-08-30  7:04am  partner min-taec -> kris
      2026-08-31 11:38am  split   min-taec -> kris
```

Read that alongside the household totals, which the per-person view hides:
morning on **40/56** days, arvo on **31/56**. The arvo routine is real at
household level but splits 21/15 across two loggers, so neither clears the gate.
Some of that is under-recording — the gap the rate nudge exists to close — so
expect the arvo slot to switch itself on as the log fills in. Nothing needs
changing for that to happen; the daily recompute picks it up.

Re-run it if the nudges ever feel wrong — it shows both the counts the gates read
and the verdict, so you can see *which* gate said no.

Once the migration and cron are live, the same question end-to-end:

```bash
# What would fire right now, without claiming or sending anything:
curl -H "Authorization: Bearer $NOTIFY_CRON_SECRET" \
  'https://coffeebrewlog.vercel.app/api/notify/run?dryRun=1'
```

That is the way to check this feature against real data — it reports each
person's learned times and every decision, including why something was skipped.

```sql
select * from cron.job_run_details order by start_time desc limit 20;
select id, status_code, content from net._http_response order by created desc limit 20;
```

## Limits

- **iOS needs the PWA installed.** Safari only allows Web Push from a home-screen
  app (16.4+), and the permission call must be inside a real tap. A browser tab
  gets nothing — Settings says so rather than showing a toggle that can't work.
- **Log nudges are silent until there is a pattern** — a few weeks for a new
  person, and forever for an irregular slot. The rate nudge works from the first
  brew.
- **`database.types.ts` doesn't know these tables** until migration 022 is applied
  live and `npm run gen:types` is re-run. `lib/notify/db.ts` quarantines the
  resulting cast in one file; it can be tightened afterwards.
