import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { SUPABASE_PUBLIC_KEY, SUPABASE_URL, getSecretKey } from "@/lib/env";

/** Supabase client that acts as the signed-in visitor (security rules apply). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_PUBLIC_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component; the proxy refreshes sessions instead.
        }
      },
    },
  });
}

/**
 * Supabase client with full access (secret key). Only use on the server,
 * and only after checking the visitor is allowed to do the thing.
 */
export function createAdminClient() {
  return createPlainClient(SUPABASE_URL, getSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
