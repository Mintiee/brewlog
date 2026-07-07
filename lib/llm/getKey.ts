/**
 * Server-only: load and decrypt the calling user's household AI key.
 * Returns null if no key is stored.
 */
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { decryptKey } from "./encrypt";
import type { Provider } from "./index";

export interface HouseholdKey {
  key: string;
  provider: Provider;
  householdId: string;
}

/** Resolve a user's household_id from their profile row via the service-role
 *  client (bypasses RLS), or null if the profile doesn't exist. Centralises a
 *  `profiles.select("household_id")` lookup that was previously duplicated
 *  across this function and both app/api/ai-key handlers. */
export async function householdIdFor(userId: string): Promise<string | null> {
  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("household_id").eq("id", userId).single();
  return profile?.household_id ?? null;
}

export async function getHouseholdKey(): Promise<HouseholdKey | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const householdId = await householdIdFor(user.id);
  if (!householdId) return null;

  // Load the key (using service role to access the ciphertext)
  const service = createServiceClient();
  const { data: aiRow } = await service
    .from("household_ai")
    .select("provider,key_ciphertext,key_iv")
    .eq("household_id", householdId)
    .single();

  if (!aiRow) return null;

  try {
    const plaintext = await decryptKey(aiRow.key_ciphertext, aiRow.key_iv);
    return { key: plaintext, provider: aiRow.provider as Provider, householdId };
  } catch {
    return null;
  }
}
