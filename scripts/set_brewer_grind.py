#!/usr/bin/env python3
"""
One-off: set every brewer's default grind to a fixed value (default 5) in a
household's Brew config.

  Dry run (prints before/after, no change):
    python scripts/set_brewer_grind.py
    python scripts/set_brewer_grind.py --household <uuid>

  Apply:
    python scripts/set_brewer_grind.py --commit --household <uuid>
    python scripts/set_brewer_grind.py --commit --grind 5 --household <uuid>

Reads Supabase URL + SERVICE_ROLE key from brew/.env.local (bypasses RLS).
"""
import argparse
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
    ap.add_argument("--grind", type=float, default=5)
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()
    grind = int(args.grind) if args.grind == int(args.grind) else args.grind

    env = load_env()
    hh = resolve_household(env, args.household)
    rows = rest(env, "GET", f"/rest/v1/config?select=brewers&household_id=eq.{hh}")
    if not rows:
        sys.exit(f"No config row for household {hh}.")
    brewers = rows[0]["brewers"]
    print(f"Household {hh} — {len(brewers)} brewers:")
    for b in brewers:
        print(f"  {b.get('short','?'):<10} grind {b.get('grind')} -> {grind}")
    new_brewers = [{**b, "grind": grind} for b in brewers]

    if not args.commit:
        print("\nDRY RUN — re-run with --commit to apply.")
        return

    rest(env, "PATCH", f"/rest/v1/config?household_id=eq.{hh}",
         body={"brewers": new_brewers}, prefer="return=minimal")
    print(f"\nApplied: all brewers' grind set to {grind}.")

if __name__ == "__main__":
    main()
