#!/usr/bin/env python3
"""
One-off migration: import current (non-archived) coffees from a Bean Conqueror
xlsx export into the Brew app's Supabase `coffees` table, replacing whatever
coffees currently exist for the target household.

  Dry run (default — prints what it WOULD do, writes a backup, no changes):
    python scripts/migrate_beans.py
    python scripts/migrate_beans.py --household <uuid>

  Commit (deletes existing household coffees — cascades to their brews — then inserts):
    python scripts/migrate_beans.py --commit --household <uuid>

Reads Supabase URL + SERVICE_ROLE key from brew/.env.local (service role bypasses RLS).
Only rows with Archived == False are imported (archived = finished bags).
Frozen status is not in the export → all imported as NOT frozen (frozen_grams = 0),
per the product decision.
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DEFAULT_XLSX = os.path.expanduser(
    r"~/Downloads/Beanconqueror_export_04_06_2026_07_37_06.xlsx"
)

# ---- ported from lib/domain ORIGIN_CODES (country -> ISO-2 for silhouette) ----
ORIGIN_CODES = {
    "Ethiopia": "et", "Colombia": "co", "Kenya": "ke", "Panama": "pa", "Costa Rica": "cr",
    "Guatemala": "gt", "Brazil": "br", "Rwanda": "rw", "Burundi": "bi", "Honduras": "hn",
    "Peru": "pe", "Mexico": "mx", "Indonesia": "id", "Yemen": "ye", "Tanzania": "tz",
    "El Salvador": "sv", "Nicaragua": "ni", "Bolivia": "bo", "Uganda": "ug", "India": "in",
    "China": "cn", "Ecuador": "ec", "Papua New Guinea": "pg", "DR Congo": "cd",
}

def origin_code(origin):
    if not origin:
        return None
    o = origin.strip()
    if o in ORIGIN_CODES:
        return ORIGIN_CODES[o]
    low = o.lower()
    for k, v in ORIGIN_CODES.items():
        if k.lower() in low:
            return v
    return None

# ---- ported from lib/flavour NOTE_ICONS + NOTE_COLORS (note -> family -> hex) ----
NOTE_ICONS = [
    (r"jasmine|floral|flower|honeysuckle|rose|lavender|blossom|elderflower|chamomile|hibiscus|geranium|violet|lilac|orange ?blossom|perfum|potpourri", "flower"),
    (r"citrus|lemon|lime|orange|grapefruit|bergamot|mandarin|tangerine|clementine|yuzu|pomelo|kumquat|zest|tropical|mango|pineapple|papaya|passion|guava|banana|melon|kiwi|lychee|coconut", "citrus"),
    (r"berry|berries|blueberry|blackberry|raspberry|strawberr|blackcurrant|currant|cranberry|boysenberry|mulberry|gooseberry|acai|elderberry", "berry"),
    (r"cherry|plum|peach|apricot|nectarine|apple|pear|grape|fig|date|raisin|prune|pomegranate|red ?fruit|stone ?fruit|dried ?fruit|jammy|sultana", "cherry"),
    (r"chocolate|cocoa|cacao|fudge|mocha|brownie|truffle|cocoa ?nib|roast|toast|smoke|smoky|burnt", "choco"),
    (r"almond|walnut|hazelnut|peanut|pecan|cashew|macadamia|marzipan|praline|\bnut|nutty|malt|biscuit|bread|cereal|graham|cracker|granola|\boat|shortbread|digestive", "nut"),
    (r"caramel|brown ?sugar|cane ?sugar|\bsugar|honey|candied|syrup|toffee|molasses|maple|vanilla|butterscotch|nougat|panela|sweet|cinnamon|clove|nutmeg|cardamom|ginger|spice|baking|anise", "sugar"),
    (r"wine|winey|boozy|\brum|ferment|funky|brandy|\bport\b|whisk|champagne|cognac|liqueur|sherry|booze", "wine"),
    (r"\btea|herbal|\bherb|mint|grass|grassy|green|vegetal|vegetable|tomato|tobacco|\bhay|savory|savoury|thyme|basil|sage|eucalyptus|cedar|pine|earth|leather|mushroom|woody|\bwood", "leaf"),
]
NOTE_COLORS = {
    "flower": "#d98fb0", "citrus": "#e3b552", "berry": "#a886c4", "cherry": "#d97a6a",
    "choco": "#b07d52", "nut": "#cda877", "sugar": "#e0a55f", "wine": "#c06b7d",
    "leaf": "#93ad6d", "drop": "#9c9385",
}

def note_color(note):
    n = (note or "").lower().strip()
    for pat, fam in NOTE_ICONS:
        if re.search(pat, n):
            return NOTE_COLORS[fam]
    return NOTE_COLORS["drop"]

def map_process(raw):
    s = (raw or "").lower()
    if "honey" in s:
        return "Honey"
    if "natural" in s:
        return "Natural"
    return "Washed"

def parse_roast_date(raw):
    """Bean Conqueror exports DD.MM.YYYY. Return ISO YYYY-MM-DD or None."""
    if not raw or str(raw).strip().lower() == "invalid date":
        return None
    s = str(raw).strip()
    m = re.match(r"^(\d{1,2})\.(\d{1,2})\.(\d{4})$", s)
    if not m:
        return None
    d, mo, y = (int(x) for x in m.groups())
    try:
        return dt.date(y, mo, d).isoformat()
    except ValueError:
        return None

# ---- env / REST helpers ----
def load_env():
    env = {}
    path = os.path.join(ROOT, ".env.local")
    with open(path) as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                env[k] = v
    return env

def rest(env, method, path, body=None, prefer=None):
    url = env["NEXT_PUBLIC_SUPABASE_URL"] + path
    sr = env["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {
        "apikey": sr,
        "Authorization": "Bearer " + sr,
        "Content-Type": "application/json",
    }
    if prefer:
        headers["Prefer"] = prefer
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code} on {method} {path}: {e.read().decode()}")

# ---- xlsx parse ----
def parse_beans(xlsx_path):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx_path, read_only=True, data_only=True)
    ws = wb["Beans"]
    rows = list(ws.iter_rows(values_only=True))
    out = []
    for r in rows[1:]:
        if str(r[19]) != "False":   # Archived
            continue
        roasted = parse_roast_date(r[2])
        if not roasted:
            print(f"  ! skipping (bad roast date): {r[0]}")
            continue
        notes = [s.strip() for s in str(r[10] or "").split(",") if s.strip()]
        origin = (r[20] or "").strip()
        out.append({
            "roaster": (r[1] or "Unknown").strip(),
            "name": (r[0] or "Untitled").strip(),
            "origin": origin or "—",
            "region": (r[21] or "").strip(),
            "varietal": (r[25] or "").strip(),
            "process": map_process(r[26]),
            "roast": "light",
            "roasted_at": roasted,
            "rest_days": 28,
            "peak_days": 56,
            "grams": int(round(float(r[8]))) if r[8] is not None else 250,
            "frozen_grams": 0,
            "archived": False,
            "notes": notes,
            "color": note_color(notes[0]) if notes else "#cf9a5a",
            "cc": origin_code(origin),
        })
    return out

def resolve_household(env, given):
    if given:
        return given
    households = rest(env, "GET", "/rest/v1/households?select=id,invite_code")
    if not households:
        sys.exit("No households found in this project.")
    if len(households) == 1:
        hh = households[0]["id"]
        profiles = rest(env, "GET", f"/rest/v1/profiles?select=name&household_id=eq.{hh}")
        names = ", ".join(p.get("name", "?") for p in (profiles or [])) or "(no profiles)"
        print(f"Using the only household {hh}  (members: {names})")
        return hh
    print("Multiple households exist — pass --household <uuid>. Options:")
    for h in households:
        profs = rest(env, "GET", f"/rest/v1/profiles?select=name&household_id=eq.{h['id']}")
        names = ", ".join(p.get("name", "?") for p in (profs or [])) or "(none)"
        print(f"  {h['id']}  invite={h.get('invite_code')}  members={names}")
    sys.exit(1)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default=DEFAULT_XLSX)
    ap.add_argument("--household", default=None)
    ap.add_argument("--commit", action="store_true")
    args = ap.parse_args()

    env = load_env()
    coffees = parse_beans(args.xlsx)
    print(f"\nParsed {len(coffees)} non-archived coffees from {args.xlsx}\n")
    for c in coffees:
        print(f"  {c['roasted_at']}  {c['roaster']:<24} {c['name'][:42]:<42} "
              f"{c['origin']:<14} {c['process']:<8} {c['grams']}g  cc={c['cc']}")

    hh = resolve_household(env, args.household)

    existing = rest(env, "GET", f"/rest/v1/coffees?select=*&household_id=eq.{hh}") or []
    brews = rest(env, "GET", f"/rest/v1/brews?select=*&household_id=eq.{hh}") or []
    print(f"\nExisting in household: {len(existing)} coffees, {len(brews)} brews.")

    # Backup (always — even on dry run) so the current state is recoverable.
    ts = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(HERE, f"backup-{ts}.json")
    with open(backup_path, "w", encoding="utf-8") as f:
        json.dump({"household_id": hh, "coffees": existing, "brews": brews}, f, indent=2)
    print(f"Backed up existing state to {backup_path}")

    if not args.commit:
        print("\nDRY RUN — no changes made. Re-run with --commit to apply.")
        print(f"  Would DELETE {len(existing)} coffees (cascades to {len(brews)} brews)")
        print(f"  Would INSERT {len(coffees)} coffees.")
        return

    print("\nCOMMITTING…")
    rest(env, "DELETE", f"/rest/v1/coffees?household_id=eq.{hh}", prefer="return=minimal")
    print(f"  Deleted {len(existing)} existing coffees (+ cascaded brews).")
    payload = [{**c, "household_id": hh} for c in coffees]
    rest(env, "POST", "/rest/v1/coffees", body=payload, prefer="return=minimal")
    print(f"  Inserted {len(coffees)} coffees.")
    print("Done.")

if __name__ == "__main__":
    main()
