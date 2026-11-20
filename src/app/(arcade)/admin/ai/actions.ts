"use server";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertParent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getOrigin } from "@/lib/origin";
import { getConnection, runAI } from "@/lib/ai";
import { PKCE_COOKIE, saveConnection } from "@/lib/ai/connect";
import { PROVIDERS, type Provider } from "@/lib/ai/providers";

type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
const fail = (e: unknown): { ok: false; error: string } => ({ ok: false, error: e instanceof Error ? e.message : String(e) });

/**
 * Step 1 of "Connect AI account": sends the parent to OpenRouter's own sign-in
 * page. They log in there and press Allow; OpenRouter sends them back to
 * /admin/ai/callback with a one-time code. Their password never touches this site.
 */
export async function startOpenRouterConnect() {
  const { family } = await assertParent();
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const state = randomBytes(16).toString("base64url");
  (await cookies()).set(PKCE_COOKIE, JSON.stringify({ verifier, state, familyId: family.id }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin/ai",
    maxAge: 600,
  });
  const params = new URLSearchParams({
    callback_url: `${await getOrigin()}/admin/ai/callback`,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    key_label: `Family Arcade · ${family.name}`.slice(0, 60),
  });
  redirect(`https://openrouter.ai/auth?${params}`);
}

export async function connectWithKey(provider: Provider, key: string): Promise<Result> {
  try {
    const { family, user } = await assertParent();
    if (!(provider in PROVIDERS)) throw new Error("Pick which AI company the key is from.");
    const clean = key.trim();
    if (clean.length < 20 || /\s/.test(clean)) throw new Error("That doesn't look like a whole key. Copy it again and paste it in.");
    if (!PROVIDERS[provider].keyLooksLike.test(clean)) {
      throw new Error(`That doesn't look like a ${PROVIDERS[provider].label} key. Did you pick the right company?`);
    }
    await saveConnection(family.id, user.id, provider, clean);
    revalidatePath("/admin/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Sends a tiny request (costs a fraction of a cent) to prove everything works end to end. */
export async function testConnection(): Promise<Result<{ reply: string; cost: number }>> {
  try {
    const member = await assertParent();
    const res = await runAI(member, "test", {
      system: "You are the friendly helper inside Family Arcade, an app where families make games together.",
      messages: [{ role: "user", content: "Say hello to our family in one short, cheerful sentence." }],
      maxTokens: 2000,
      effort: "low",
    });
    revalidatePath("/admin/ai");
    return { ok: true, data: { reply: res.text.trim().slice(0, 300), cost: res.costUsd } };
  } catch (e) {
    return fail(e);
  }
}

export async function disconnectAI(): Promise<Result> {
  try {
    const { family } = await assertParent();
    const conn = await getConnection(family.id);
    if (!conn) return { ok: true };
    const { error } = await createAdminClient().from("ai_connections").delete().eq("family_id", family.id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

function cleanLimit(v: number | null) {
  if (v === null) return null;
  if (!Number.isFinite(v) || v < 0 || v > 1000) throw new Error("Limits are between $0 and $1000 a month.");
  return Math.round(v * 100) / 100;
}

export async function setKidDefaultLimit(limit: number): Promise<Result> {
  try {
    const { family } = await assertParent();
    const value = cleanLimit(limit);
    const { error } = await createAdminClient().from("families").update({ kid_monthly_limit_usd: value ?? 0 }).eq("id", family.id);
    if (error) throw new Error(error.message);
    revalidatePath("/admin/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** limit = null: kids use the family default, grown-ups have no limit. */
export async function setMemberAI(userId: string, fields: { limit?: number | null; enabled?: boolean }): Promise<Result> {
  try {
    const { family } = await assertParent();
    const update: Record<string, unknown> = {};
    if ("limit" in fields) update.ai_monthly_limit_usd = cleanLimit(fields.limit ?? null);
    if (typeof fields.enabled === "boolean") update.ai_enabled = fields.enabled;
    const { data, error } = await createAdminClient()
      .from("profiles")
      .update(update)
      .eq("id", userId)
      .eq("family_id", family.id)
      .select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error("That person isn't in your family.");
    revalidatePath("/admin/ai");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
