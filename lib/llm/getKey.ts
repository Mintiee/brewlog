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

export async function getHouseholdKey(): Promise<HouseholdKey | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Look up the profile to get household_id
  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("household_id").eq("id", user.id).single();
  if (!profile) return null;

  // Load the key (using service role to access the ciphertext)
  const { data: aiRow } = await service
    .from("household_ai")
    .select("provider,key_ciphertext,key_iv")
    .eq("household_id", profile.household_id)
    .single();

  if (!aiRow) return null;

  try {
    const plaintext = await decryptKey(aiRow.key_ciphertext, aiRow.key_iv);
    return { key: plaintext, provider: aiRow.provider as Provider, householdId: profile.household_id };
  } catch {
    return null;
  }
}
