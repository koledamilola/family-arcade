import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { encryptSecret, keyHint } from "./crypto";
import { type Provider, verifyKey } from "./providers";

// Kept out of the "use server" actions file on purpose: every export there can be
// called by any visitor. This one must only run after a parent check.

export const PKCE_COOKIE = "fa_or_pkce";

/** Verifies a key, then saves it (encrypted) as the family's AI connection, replacing any old one. */
export async function saveConnection(familyId: string, userId: string, provider: Provider, key: string) {
  const verified = await verifyKey(provider, key);
  const { error } = await createAdminClient().from("ai_connections").upsert({
    family_id: familyId,
    provider,
    key_ciphertext: encryptSecret(key),
    key_hint: keyHint(key),
    model: verified.model,
    price_in: verified.price_in,
    price_out: verified.price_out,
    connected_by: userId,
    connected_at: new Date().toISOString(),
    last_checked_at: new Date().toISOString(),
    last_error: null,
  });
  if (error) throw new Error(error.message);
}
