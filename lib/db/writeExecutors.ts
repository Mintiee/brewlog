/**
 * Serialisable write descriptors + their executors — the bridge between the
 * durable offline outbox (lib/store/outbox) and the live DB access layer.
 *
 * The outbox stores a plain, JSON-serialisable {kind, ...payload} object (a
 * closure can't survive a page reload in IndexedDB), and drains it later by
 * looking the kind up in this map. Scope is deliberately the kitchen write flows
 * that a user performs offline — logging a brew, rating it, adjusting a bag —
 * not every mutation in the app. Other mutations stay on the synchronous
 * rollback path (see lib/store/persist).
 */
import type { Brew, Coffee } from "@/lib/types";
import { insertBrew, updateBrew, upsertCoffee } from "./index";

export type WriteDescriptor =
  | { kind: "insertBrew"; payload: Brew }
  | { kind: "updateBrew"; id: string; patch: Partial<Brew> }
  | { kind: "upsertCoffee"; payload: Coffee };

/** Run a descriptor against the DB. Throws on failure (the outbox classifies the
 *  error to decide drop-vs-retry, matching persist()'s isPermanent rules). */
export function executeWrite(d: WriteDescriptor): Promise<unknown> {
  switch (d.kind) {
    case "insertBrew":
      return insertBrew(d.payload);
    case "updateBrew":
      return updateBrew(d.id, d.patch);
    case "upsertCoffee":
      return upsertCoffee(d.payload);
    default: {
      // Exhaustiveness guard — a new kind must add an executor here.
      const _never: never = d;
      return Promise.reject(new Error(`Unknown write descriptor: ${JSON.stringify(_never)}`));
    }
  }
}
