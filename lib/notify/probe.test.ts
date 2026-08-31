/**
 * Read-only probe: run the nudge engine against the *live* brew history and
 * print what it learns for each household member.
 *
 * Skipped by default so `npm test` stays offline and deterministic. To run it:
 *
 *   NUDGE_PROBE=1 npx vitest run lib/notify/probe.test.ts --pool=threads
 *
 * It reads `.env.local` for the service-role key, issues two SELECTs, and writes
 * nothing. Use it to answer the question the unit tests can't: given this
 * household's actual behaviour, would either slot ever activate, and at what
 * time? Worth running before enabling reminders, and again if the nudges ever
 * feel wrong.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { learnSlots, WINDOWS, type SlotName } from "./schedule";
import { zoned, minutesToClock } from "./tz";

const TZ = process.env.NUDGE_PROBE_TZ || "Australia/Sydney";

function envLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch { /* no local env — the probe will skip */ }
  return out;
}

describe.skipIf(!process.env.NUDGE_PROBE)("nudge probe (live data, read-only)", () => {
  it("reports what each person's slots would be", { timeout: 60_000 }, async () => {
    const env = { ...envLocal(), ...process.env };
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = env.SUPABASE_SERVICE_ROLE_KEY;
    expect(url && key, "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY must be set").toBeTruthy();

    const db = createClient(url!, key!, { auth: { persistSession: false } });
    const nowMs = Date.now();
    const since = new Date(nowMs - 56 * 86_400_000).toISOString();

    const [{ data: profiles, error: pErr }, { data: brews, error: bErr }] = await Promise.all([
      db.from("profiles").select("id, name, household_id"),
      db.from("brews").select("started_at, logged_by").eq("guest", false).gte("started_at", since),
    ]);
    if (pErr) throw pErr;
    if (bErr) throw bErr;

    const nameOf = new Map((profiles ?? []).map((p) => [p.id, (p.name ?? "").trim().toLowerCase()]));
    const byPerson = new Map<string, number[]>();
    for (const b of brews ?? []) {
      const person = nameOf.get(b.logged_by);
      if (!person) continue;
      const list = byPerson.get(person) ?? [];
      list.push(Date.parse(b.started_at));
      byPerson.set(person, list);
    }

    const lines: string[] = [`\nNudge probe — ${TZ}, ${brews?.length ?? 0} non-guest brews in the last 56 days\n`];
    for (const [person, times] of [...byPerson].sort()) {
      const slots = learnSlots(times, TZ, nowMs);
      lines.push(`  ${person} — ${times.length} brews`);
      for (const slot of ["morning", "arvo"] as SlotName[]) {
        const { from, to } = WINDOWS[slot];
        const inWindow = times.filter((t) => {
          const m = zoned(t, TZ).minutes;
          return m >= from && m < to;
        });
        const dayset = new Set(inWindow.map((t) => zoned(t, TZ).day));
        // The habit gate reads the last 28 days, so report that number too —
        // it is the one that actually decides whether a slot is active.
        const recent = [...dayset].filter((d) => Date.parse(`${d}T00:00:00Z`) >= nowMs - 28 * 86_400_000).length;
        const st = slots[slot];
        const verdict = st.active && st.fireMin !== null ? `nudges at ${minutesToClock(st.fireMin)}` : "silent (no clear pattern)";
        lines.push(`      ${slot.padEnd(8)} ${String(dayset.size).padStart(2)}/56 days, ${String(recent).padStart(2)}/28 recent — ${verdict}`);
      }
    }
    console.log(lines.join("\n"));

    expect(byPerson.size).toBeGreaterThan(0);
  });
});
