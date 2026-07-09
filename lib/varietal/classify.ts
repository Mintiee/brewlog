// Client-side bridge to /api/classify-varietals — sends alias-map-missed
// varietal tokens to the LLM once, pushes the validated canonical names into
// the in-memory learned cache, and relies on the route's learned_varietals
// upsert for cross-session/global reuse. Mirrors lib/flavour/classify.ts.

import { setLearnedVarietals, unknownVarietals, type LearnedVarietal } from "@/lib/varietal";

// Session dedupe — tokens already sent (pending or answered).
const requested = new Set<string>();

const CHUNK = 25;

/** Classify unknown varietal tokens via /api/classify-varietals. Pushes results
 *  into setLearnedVarietals and returns the combined learned map, or null when
 *  there was nothing new to learn (all known/in-flight, no AI key → 403, or errors). */
export async function classifyUnknownVarietals(
  tokens: string[],
): Promise<Record<string, LearnedVarietal> | null> {
  const unknown = unknownVarietals(tokens).filter((t) => !requested.has(t));
  if (unknown.length === 0) return null;
  unknown.forEach((t) => requested.add(t));

  const learned: Record<string, LearnedVarietal> = {};
  for (let i = 0; i < unknown.length; i += CHUNK) {
    const batch = unknown.slice(i, i + CHUNK);
    try {
      const res = await fetch("/api/classify-varietals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ varietals: batch }),
      });
      if (res.status === 403) return null; // no AI key — keep `requested` so we don't retry this session
      if (!res.ok) {
        batch.forEach((t) => requested.delete(t)); // transient — let a later save retry
        continue;
      }
      const { map } = (await res.json()) as { map: Record<string, LearnedVarietal> };
      Object.assign(learned, map);
    } catch {
      batch.forEach((t) => requested.delete(t)); // network error — let a later save retry
    }
  }

  if (Object.keys(learned).length === 0) return null;
  setLearnedVarietals(learned);
  return learned;
}
