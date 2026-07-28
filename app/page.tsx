import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { AppData } from "@/lib/store/AppContext";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile,
  fetchAiKeyStatus, fetchLearnedNotes, fetchLearnedVarietals, fetchRecipes,
} from "@/lib/db";

export default async function Home() {
  // Check if Supabase is configured — if no env vars, run in demo mode (seed data, no auth)
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseConfigured) return <AppShell />;

  const supabase = await createClient();

  // getUser() is a real network round-trip to Supabase Auth — it revalidates the JWT
  // rather than trusting the cookie. It used to sit *in front* of the query batch, so
  // every single page load paid an auth RTT before the first query even started.
  //
  // getSession() reads the same cookie locally with no network, which is enough to
  // learn the user id and start the queries. The authoritative check still happens:
  // we await getUser() below and redirect before rendering anything. Firing the
  // queries early is safe because RLS — enforced by Postgres against the JWT, not by
  // this code — is what actually scopes them; a stale or forged cookie reads nothing.
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  const authCheck = supabase.auth.getUser();

  // Prefetch everything server-side (colocated with Supabase) and seed the client.
  // allSettled rather than all: if the auth check below redirects, an outstanding
  // rejection here would otherwise be unhandled.
  const prefetch = userId
    ? Promise.allSettled([
        fetchProfile(userId, supabase),
        fetchCoffees(supabase),
        fetchBrews(supabase),
        fetchRecipes(supabase),
        fetchConfig(supabase),
        fetchAiKeyStatus(supabase),
        fetchLearnedNotes(supabase),
        fetchLearnedVarietals(supabase),
      ])
    : null;

  const { data: { user } } = await authCheck;
  if (!user) {
    await prefetch; // settle before unwinding, so nothing is left dangling
    redirect("/login");
  }

  const results = await prefetch!;
  const [profileR, coffeesR, brewsR, recipesR, configR, aiStatusR, notesR, varietalsR] = results;

  // Anything the app genuinely can't render without still fails the request.
  const required = <T,>(r: PromiseSettledResult<T>): T => {
    if (r.status === "rejected") throw r.reason;
    return r.value;
  };
  // ...and the two that predate their migrations degrade instead, as before.
  const optional = <T,>(r: PromiseSettledResult<T>, fallback: T, label?: string): T => {
    if (r.status === "rejected") {
      if (label) console.warn(`${label} failed — feature unavailable`, r.reason);
      return fallback;
    }
    return r.value;
  };

  const initialData: AppData = {
    profile: required(profileR),
    coffees: required(coffeesR),
    brews: required(brewsR),
    // Degrade gracefully if the recipes table isn't migrated yet.
    recipes: optional(recipesR, [], "fetchRecipes"),
    config: required(configR),
    aiStatus: required(aiStatusR),
    notes: required(notesR),
    // Degrade gracefully if migration 019 hasn't been applied yet.
    varietals: optional(varietalsR, {}),
  };
  return <AppShell initialData={initialData} />;
}
