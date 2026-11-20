import type { Metadata } from "next";
import { requireParent } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConnection, limitFor, monthlySpend } from "@/lib/ai";
import { PROVIDERS } from "@/lib/ai/providers";
import { AIConnect, type MemberSpend } from "./ai-connect";

export const metadata: Metadata = { title: "AI" };

export default async function AIPage(props: PageProps<"/admin/ai">) {
  const params = await props.searchParams;
  const { family, user } = await requireParent();
  const admin = createAdminClient();

  const [conn, spend, { data: fam }, { data: people }] = await Promise.all([
    getConnection(family.id),
    monthlySpend(family.id),
    admin.from("families").select("kid_monthly_limit_usd").eq("id", family.id).single(),
    admin
      .from("profiles")
      .select("id, display_name, avatar_emoji, member_role, ai_monthly_limit_usd, ai_enabled")
      .eq("family_id", family.id)
      .order("created_at"),
  ]);
  const kidDefault = Number(fam?.kid_monthly_limit_usd ?? 5);

  const members: MemberSpend[] = (people ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    emoji: p.avatar_emoji,
    role: p.member_role,
    isMe: p.id === user.id,
    enabled: p.ai_enabled !== false,
    ownLimit: p.ai_monthly_limit_usd === null ? null : Number(p.ai_monthly_limit_usd),
    limit: limitFor(p, kidDefault),
    spent: spend.byUser[p.id] ?? 0,
  }));

  return (
    <AIConnect
      connection={
        conn
          ? {
              provider: conn.provider,
              providerLabel: PROVIDERS[conn.provider].label,
              model: conn.model,
              keyHint: conn.key_hint,
              connectedAt: conn.connected_at,
              lastError: conn.last_error,
            }
          : null
      }
      providers={Object.entries(PROVIDERS)
        .filter(([id]) => id !== "openrouter")
        .map(([id, p]) => ({ id: id as keyof typeof PROVIDERS, label: p.label, company: p.company, keyUrl: p.keyUrl, steps: p.steps }))}
      kidDefault={kidDefault}
      totalSpent={spend.total}
      members={members}
      notice={
        typeof params.error === "string"
          ? { kind: "error", text: params.error }
          : params.connected === "1"
            ? { kind: "ok", text: "🎉 Connected! Your family can now build games with AI. Press Test to make sure it works." }
            : null
      }
    />
  );
}
