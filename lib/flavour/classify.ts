// Client-side bridge to /api/classify-notes — sends lexicon-missed notes to the
// LLM once, pushes the validated families into the in-memory learned cache, and
// relies on the route's learned_notes upsert for cross-session/global reuse.

import { setLearnedNotes, unknownNotes, type FlavourFamily } from "@/lib/flavour";

// Session dedupe — notes already sent (pending or answered). Single dedupe point
// shared by the save trigger and the load sweep, so concurrent calls can't
// double-request the same note.
const requested = new Set<string>();

const CHUNK = 25;

/** Classify unknown notes via /api/classify-notes. Pushes results into
 *  setLearnedNotes and returns the combined learned map, or null when there was
 *  nothing new to learn (all known/in-flight, no AI key → 403, or errors). */
export async function classifyUnknownNotes(
  notes: string[],
): Promise<Record<string, FlavourFamily> | null> {
  const unknown = unknownNotes(notes).filter((n) => !requested.has(n));
  if (unknown.length === 0) return null;
  unknown.forEach((n) => requested.add(n));

  const learned: Record<string, FlavourFamily> = {};
  for (let i = 0; i < unknown.length; i += CHUNK) {
    const batch = unknown.slice(i, i + CHUNK);
    try {
      const res = await fetch("/api/classify-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: batch }),
      });
      if (res.status === 403) return null; // no AI key — keep `requested` so we don't retry this session
      if (!res.ok) {
        batch.forEach((n) => requested.delete(n)); // transient — let a later save retry
        continue;
      }
      const { map } = (await res.json()) as { map: Record<string, FlavourFamily> };
      Object.assign(learned, map);
    } catch {
      batch.forEach((n) => requested.delete(n)); // network error — let a later save retry
    }
  }

  if (Object.keys(learned).length === 0) return null;
  setLearnedNotes(learned);
  return learned;
}
