// Reads Supabase settings. Supports both the newer "publishable/secret" key
// names and the older "anon/service_role" names.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "";

export function isConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLIC_KEY);
}

export function getSecretKey() {
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!key) {
    throw new Error(
      "SUPABASE_SECRET_KEY is missing. Add it to .env.local (and to Vercel's environment variables).",
    );
  }
  return key;
}

export const SITE_NAME = process.env.NEXT_PUBLIC_SITE_NAME || "Family Arcade";
