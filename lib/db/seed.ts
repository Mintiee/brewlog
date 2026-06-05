/**
 * Server-side seeding — inserts demo shelf + brews for a fresh household.
 * Called with the service-role client so it can write directly.
 */
import { SEED_COFFEES, SEED_BREWS, SEED_CONFIG } from "@/lib/domain/seed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function seedHousehold(service: any, householdId: string, userId: string) {
  // Insert coffees, capturing the id map (seed id → real uuid)
  const coffeeRows = SEED_COFFEES.map((c) => ({
    household_id: householdId,
    roaster: c.roaster, name: c.name, origin: c.origin, region: c.region,
    varietal: c.varietal, process: c.process, roast: c.roast, roasted_at: c.roasted_at,
    rest_days: c.rest_days, peak_days: c.peak_days, grams: c.grams,
    frozen_grams: c.frozen_grams, frozen_at: c.frozen_at, thawed_at: c.thawed_at,
    archived: c.archived, notes: c.notes, color: c.color, cc: c.cc,
  }));

  const { data: insertedCoffees, error: coffeeErr } = await service
    .from("coffees").insert(coffeeRows).select("id,name");
  if (coffeeErr) throw coffeeErr;

  // Build seed-id → real-uuid map by matching name
  const idMap: Record<string, string> = {};
  (insertedCoffees ?? []).forEach((row: { id: string; name: string }) => {
    const seed = SEED_COFFEES.find((c) => c.name === row.name);
    if (seed) idMap[seed.id] = row.id;
  });

  // Insert brews
  const brewRows = SEED_BREWS
    .filter((b) => idMap[b.coffee_id]) // only brews whose coffee was inserted
    .map((b) => ({
      household_id: householdId,
      coffee_id: idMap[b.coffee_id],
      brewer_id: b.brewer_id,
      dose: b.dose, water: b.water, bypass: b.bypass, temp: b.temp,
      grind: b.grind, ratio: b.ratio, water_type: b.water_type,
      started_at: new Date(parseInt(b.started_at)).toISOString(),
      rest_days: b.rest_days,
      rated_at: b.rated_at ? new Date(parseInt(b.rated_at)).toISOString() : null,
      logged_by: userId,
      stars: b.stars, stars2: b.stars2, taster1: b.taster1, taster2: b.taster2,
      acidity: b.acidity, sweetness: b.sweetness, body: b.body, clarity: b.clarity,
      note: b.note,
    }));

  if (brewRows.length) {
    const { error: brewErr } = await service.from("brews").insert(brewRows);
    if (brewErr) throw brewErr;
  }

  // Insert config
  const { error: cfgErr } = await service.from("config").insert({
    household_id: householdId,
    grinder: SEED_CONFIG.grinder,
    brewers: SEED_CONFIG.brewers,
    waters: SEED_CONFIG.waters,
    default_water: SEED_CONFIG.default_water,
    taster2: SEED_CONFIG.taster2,
    random_greeting: SEED_CONFIG.random_greeting,
  });
  if (cfgErr) throw cfgErr;
}
