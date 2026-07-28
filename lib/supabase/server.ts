import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/database.types";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Server Component, ignore */ }
        },
      },
    }
  );
}

/**
 * Service-role client — for API routes that need to bypass RLS.
 *
 * Memoised at module scope. This is stateless with respect to the request (it carries
 * no user session, only the service key), so there is nothing per-request to rebuild;
 * /api/insight alone used to construct three of them per call, each going through a
 * CJS `require` of the whole supabase-js package.
 */
let serviceClient: SupabaseClient<Database> | null = null;

export function createServiceClient(): SupabaseClient<Database> {
  if (serviceClient) return serviceClient;
  serviceClient = createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    // No session to persist or refresh — this client is never a signed-in user.
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return serviceClient;
}
