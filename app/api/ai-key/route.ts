/**
 * POST /api/ai-key — save (and test) a household AI key
 * DELETE /api/ai-key — remove the household AI key
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptKey } from "@/lib/llm/encrypt";
import { detectProvider, validateKey } from "@/lib/llm";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { key } = await req.json();
  if (!key?.trim()) return NextResponse.json({ error: "Key is required" }, { status: 400 });

  const provider = detectProvider(key.trim());

  // Validate the key before storing it
  const valid = await validateKey(key.trim(), provider);
  if (!valid) return NextResponse.json({ error: "Key was rejected by the provider. Check it and try again." }, { status: 422 });

  const { ciphertext, iv } = await encryptKey(key.trim());

  const service = createServiceClient();
  // Get household_id
  const { data: profile } = await service.from("profiles").select("household_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await service.from("household_ai").upsert({
    household_id: profile.household_id,
    provider,
    key_ciphertext: ciphertext,
    key_iv: iv,
    set_by: user.id,
    set_at: new Date().toISOString(),
  });

  return NextResponse.json({ provider, set: true });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const service = createServiceClient();
  const { data: profile } = await service.from("profiles").select("household_id").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await service.from("household_ai").delete().eq("household_id", profile.household_id);

  return NextResponse.json({ set: false });
}
