import "server-only";
import type { Member } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { decryptSecret } from "./crypto";
import { type ChatRequest, type ChatResult, type Provider, chat, modelFor } from "./providers";

export type Connection = {
  family_id: string;
  provider: Provider;
  key_ciphertext: string;
  key_hint: string;
  model: string;
  price_in: number;
  price_out: number;
  connected_at: string;
  last_checked_at: string | null;
  last_error: string | null;
};

export async function getConnection(familyId: string) {
  const { data } = await createAdminClient().from("ai_connections").select("*").eq("family_id", familyId).maybeSingle<Connection>();
  return data;
}

export function startOfMonth(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Each person's AI spending this calendar month, in US dollars. */
export async function monthlySpend(familyId: string) {
  const { data } = await createAdminClient()
    .from("ai_usage")
    .select("user_id, cost_usd")
    .eq("family_id", familyId)
    .gte("created_at", startOfMonth());
  const byUser: Record<string, number> = {};
  let total = 0;
  for (const row of data ?? []) {
    const cost = Number(row.cost_usd);
    total += cost;
    if (row.user_id) byUser[row.user_id] = (byUser[row.user_id] ?? 0) + cost;
  }
  return { total, byUser };
}

/** A person's monthly limit in dollars, or null for no limit. */
export function limitFor(
  profile: { member_role: string | null; ai_monthly_limit_usd: number | string | null },
  kidDefault: number | string,
) {
  if (profile.ai_monthly_limit_usd !== null && profile.ai_monthly_limit_usd !== undefined) return Number(profile.ai_monthly_limit_usd);
  return profile.member_role === "kid" ? Number(kidDefault) : null;
}

export class AIUnavailable extends Error {}

/**
 * The one way the app talks to AI: checks the family is connected, AI is switched
 * on for this person and they're under their monthly limit, makes the request
 * with the PARENT's connection, then records what it cost.
 */
export async function runAI(member: Member, purpose: string, req: ChatRequest): Promise<ChatResult & { costUsd: number }> {
  const admin = createAdminClient();
  const familyId = member.family.id;
  const isKid = member.profile.member_role === "kid";

  const conn = await getConnection(familyId);
  if (!conn) {
    throw new AIUnavailable(isKid ? "The AI helper isn't set up yet. Ask a parent to connect it." : "Connect an AI account first (Family → AI).");
  }

  const [{ data: me }, { data: fam }, spend] = await Promise.all([
    admin.from("profiles").select("member_role, ai_monthly_limit_usd, ai_enabled").eq("id", member.user.id).single(),
    admin.from("families").select("kid_monthly_limit_usd").eq("id", familyId).single(),
    monthlySpend(familyId),
  ]);
  if (me && me.ai_enabled === false) {
    throw new AIUnavailable(isKid ? "A parent has paused the AI helper for you." : "AI is switched off for your account.");
  }
  const limit = me ? limitFor(me, fam?.kid_monthly_limit_usd ?? 5) : null;
  const spent = spend.byUser[member.user.id] ?? 0;
  if (limit !== null && spent >= limit) {
    throw new AIUnavailable(
      isKid
        ? "You've used all your AI building for this month! Ask a parent if you can have a bit more."
        : `You've reached your $${limit.toFixed(2)} AI limit for this month.`,
    );
  }

  const use = modelFor(conn.provider, conn.model, { price_in: Number(conn.price_in), price_out: Number(conn.price_out) }, req.tier);

  let result: ChatResult;
  try {
    result = await chat(conn.provider, decryptSecret(conn.key_ciphertext), use.model, req);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await admin.from("ai_connections").update({ last_error: message, last_checked_at: new Date().toISOString() }).eq("family_id", familyId);
    throw new AIUnavailable(isKid ? "The AI helper isn't working right now. Tell a parent so they can check it." : message);
  }

  const costUsd = result.costUsd ?? (result.inputTokens * use.price_in + result.outputTokens * use.price_out) / 1_000_000;
  await admin.from("ai_usage").insert({
    family_id: familyId,
    user_id: member.user.id,
    provider: conn.provider,
    model: use.model,
    purpose,
    input_tokens: result.inputTokens,
    output_tokens: result.outputTokens,
    cost_usd: costUsd,
  });
  if (conn.last_error) await admin.from("ai_connections").update({ last_error: null }).eq("family_id", familyId);
  return { ...result, costUsd };
}
