#!/usr/bin/env python3
"""
One-off maintenance against the live Brew DB:

  A) Set every FROZEN coffee (frozen_grams > 0, not archived) to 40 days rested
     by setting roasted_at = today - 40 days. (There is no stored "days rested" —
     it's derived as today - roasted_at; 40 days > the 28-day rest window, so
     these show "Ready" in the frozen row.)

  B) Force-regenerate the "This fortnight" insight by deleting the cached
     household_insight row. The route upserts a fresh row on the next /api/insight
     call. NOTE: the client also caches today's insight in localStorage
     ("brew_insight_v2") and short-circuits before calling the API, so after this
     you must clear that key (or clear site data) on the viewing device.

  Dry run (prints before/after, no change):
    python scripts/oneoff_frozen_rest_and_insight.py
    python scripts/oneoff_frozen_rest_and_insight.py --household <uuid>

  Apply:
    python scripts/oneoff_frozen_rest_and_insight.py --commit
    python scripts/oneoff_frozen_rest_and_insight.py --commit --days 40 --household <uuid>

Reads Supabase URL + SERVICE_ROLE key from brew/.env.local (bypasses RLS).
"""
import argparse
import datetime
import json
import os
import sys
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env.local")) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v
    return env

def rest(env, method, path, body=None, prefer=None):
    sr = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": sr, "Authorization": "Bearer " + sr, "Content-Type": "application/json"}
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(env["NEXT_PUBLIC_SUPABASE_URL"] + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode()}")

def resolve_household(env, given):
    if given:
        return given
    hs = rest(env, "GET", "/rest/v1/households?select=id")
    if hs and len(hs) == 1:
        return hs[0]["id"]
    sys.exit("Pass --household <uuid> (found %d households)." % (len(hs) if hs else 0))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--household", default=None)
    ap.add_argument("--days", type=int, default=40, help="days rested to set (roasted_at = today - days)")
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    env = load_env()
    hh = resolve_household(env, args.household)
    target = (datetime.date.today() - datetime.timedelta(days=args.days)).isoformat()

    # ---- Action A: frozen coffees -> N days rested ----
    frozen_filter = f"household_id=eq.{hh}&frozen_grams=gt.0&archived=eq.false"
    rows = rest(env, "GET",
                f"/rest/v1/coffees?select=id,roaster,name,roasted_at,frozen_grams&{frozen_filter}")
    print(f"Household {hh}")
    print(f"\n[A] Frozen coffees -> {args.days} days rested (roasted_at = {target}):")
    if not rows:
        print("  (none — no coffees with frozen_grams > 0 and archived = false)")
    for r in rows:
        label = f"{r.get('roaster','?')} {r.get('name','?')}"
        print(f"  {label:<40} {r['frozen_grams']}g frozen   roasted_at {r['roasted_at']} -> {target}")

    # ---- Action B: force-regenerate the AI caches (insight + brewing tips) ----
    insight = rest(env, "GET",
                   f"/rest/v1/household_insight?select=text,generated_at&household_id=eq.{hh}")
    print("\n[B] Fortnight insight server cache (household_insight):")
    if insight:
        c = insight[0]
        print(f"  current: \"{c['text']}\"  (generated_at {c['generated_at']})")
        print("  -> DELETE row (next /api/insight call regenerates)")
    else:
        print("  (no cached row — nothing to delete)")

    # household_tips may not exist yet (migration 009); tolerate that.
    try:
        tips = rest(env, "GET",
                    f"/rest/v1/household_tips?select=tips,generated_at&household_id=eq.{hh}")
    except SystemExit:
        tips = None
        print("\n[C] Brewing tips server cache: table not found (migration 009 not applied yet).")
    else:
        print("\n[C] Brewing tips server cache (household_tips):")
        if tips:
            print(f"  current: {len(tips[0]['tips'])} tip(s)  (generated_at {tips[0]['generated_at']})")
            print("  -> DELETE row (next /api/tips call regenerates)")
        else:
            print("  (no cached row — nothing to delete)")

    if not args.commit:
        print("\nDRY RUN — re-run with --commit to apply.")
        return

    if rows:
        rest(env, "PATCH", f"/rest/v1/coffees?{frozen_filter}",
             body={"roasted_at": target}, prefer="return=minimal")
        print(f"\nApplied [A]: {len(rows)} frozen coffee(s) set to roasted_at {target}.")
    else:
        print("\n[A] nothing to apply.")

    if insight:
        rest(env, "DELETE", f"/rest/v1/household_insight?household_id=eq.{hh}",
             prefer="return=minimal")
        print("Applied [B]: deleted cached insight row.")
    else:
        print("[B] nothing to delete.")

    if tips:
        rest(env, "DELETE", f"/rest/v1/household_tips?household_id=eq.{hh}",
             prefer="return=minimal")
        print("Applied [C]: deleted cached tips row.")
    else:
        print("[C] nothing to delete.")

    print("\nNext: on the viewing device, clear localStorage keys 'brew_insight_v2'")
    print("and 'brew_tips_v1' (DevTools -> Application -> Local Storage) or clear site")
    print("data, then open Palate so the client re-fetches and regenerates.")

if __name__ == "__main__":
    main()
