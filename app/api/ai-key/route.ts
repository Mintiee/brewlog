/**
 * POST /api/ai-key — save (and test) a household AI key
 * DELETE /api/ai-key — remove the household AI key
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { encryptKey } from "@/lib/llm/encrypt";
import { detectProvider, validateKey } from "@/lib/llm";
import { householdIdFor } from "@/lib/llm/getKey";
import { requireUser } from "@/lib/api/guards";

export async function POST(req: NextRequest) {
  const userGuard = await requireUser();
  if (!userGuard.ok) return userGuard.response;
  const user = userGuard.value;

  const body = await req.json().catch(() => null);
  const key: string | undefined = body && typeof body === "object" ? body.key : undefined;
  if (!key?.trim()) return NextResponse.json({ error: "Key is required" }, { status: 400 });

  const provider = detectProvider(key.trim());

  // Validate the key before storing it
  const valid = await validateKey(key.trim(), provider);
  if (!valid) return NextResponse.json({ error: "Key was rejected by the provider. Check it and try again." }, { status: 422 });

  const { ciphertext, iv } = await encryptKey(key.trim());

  const householdId = await householdIdFor(user.id);
  if (!householdId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const service = createServiceClient();
  await service.from("household_ai").upsert({
    household_id: householdId,
    provider,
    key_ciphertext: ciphertext,
    key_iv: iv,
    set_by: user.id,
    set_at: new Date().toISOString(),
  });

  return NextResponse.json({ provider, set: true });
}

export async function DELETE() {
  const userGuard = await requireUser();
  if (!userGuard.ok) return userGuard.response;
  const user = userGuard.value;

  const householdId = await householdIdFor(user.id);
  if (!householdId) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  const service = createServiceClient();
  await service.from("household_ai").delete().eq("household_id", householdId);

  return NextResponse.json({ set: false });
}
