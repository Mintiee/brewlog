import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/AppShell";
import type { AppData } from "@/lib/store/AppContext";
import {
  fetchCoffees, fetchBrews, fetchConfig, fetchProfile,
  fetchAiKeyStatus, fetchLearnedNotes,
} from "@/lib/db";

export default async function Home() {
  // Check if Supabase is configured — if no env vars, run in demo mode (seed data, no auth)
  const supabaseConfigured = !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  if (!supabaseConfigured) return <AppShell />;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Prefetch everything server-side (colocated with Supabase, RLS via the request
  // cookies) and seed the client. This removes the client-side getUser() + 6-query
  // waterfall that previously gated first paint.
  const [profile, coffees, brews, config, aiStatus, notes] = await Promise.all([
    fetchProfile(user.id, supabase),
    fetchCoffees(supabase),
    fetchBrews(supabase),
    fetchConfig(supabase),
    fetchAiKeyStatus(supabase),
    fetchLearnedNotes(supabase),
  ]);

  const initialData: AppData = { profile, coffees, brews, config, aiStatus, notes };
  return <AppShell initialData={initialData} />;
}
