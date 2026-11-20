import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConnection, limitFor, monthlySpend } from "@/lib/ai";
import { modelFor } from "@/lib/ai/providers";
import { estimates, latestVersion, type Project } from "@/lib/studio/engine";
import { Studio, type StudioMessage } from "./studio";

export const metadata: Metadata = { title: "Game Studio" };
// Coach replies are quick, but leave room for a slow moment.
export const maxDuration = 60;

export default async function StudioProject(props: PageProps<"/studio/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { user, profile, family } = await requireMember();
  const admin = createAdminClient();

  const { data: project } = await admin.from("studio_projects").select("*").eq("id", id).eq("family_id", family.id).maybeSingle<Project>();
  const isOwner = project?.owner_id === user.id;
  if (!project || (!isOwner && profile.member_role !== "parent")) notFound();

  const [{ data: messages }, { data: versions }, latest, conn, spend, { data: me }, { data: fam }, { data: owner }, game] = await Promise.all([
    admin.from("studio_messages").select("id, role, kind, content, data, cost_usd, created_at").eq("project_id", id).order("id"),
    admin.from("studio_versions").select("version, summary, created_at").eq("project_id", id).order("version", { ascending: false }),
    latestVersion(id),
    getConnection(family.id),
    monthlySpend(family.id),
    admin.from("profiles").select("member_role, ai_monthly_limit_usd, ai_enabled").eq("id", user.id).single(),
    admin.from("families").select("kid_monthly_limit_usd").eq("id", family.id).single(),
    admin.from("profiles").select("display_name, member_role").eq("id", project.owner_id).single(),
    project.game_id
      ? admin.from("games").select("slug, status, review_note").eq("id", project.game_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let prices = null;
  if (conn) {
    const build = { price_in: Number(conn.price_in), price_out: Number(conn.price_out) };
    const coach = modelFor(conn.provider, conn.model, build, "coach");
    prices = { coach: { in: coach.price_in, out: coach.price_out }, build: { in: build.price_in, out: build.price_out } };
  }
  const est = prices ? estimates(prices, latest?.html.length ?? 30_000) : null;
  const limit = me ? limitFor(me, fam?.kid_monthly_limit_usd ?? 5) : null;
  const spent = spend.byUser[user.id] ?? 0;

  return (
    <Studio
      project={{ id: project.id, title: project.title, stage: project.stage, plan: project.plan }}
      isOwner={isOwner}
      ownerName={owner?.display_name ?? "Someone"}
      isKid={profile.member_role === "kid"}
      ownerIsKid={owner?.member_role === "kid"}
      messages={(messages ?? []) as StudioMessage[]}
      versions={(versions ?? []) as { version: number; summary: string; created_at: string }[]}
      latestHtml={latest?.html ?? null}
      latestVersion={latest?.version ?? 0}
      game={game.data ? { slug: game.data.slug as string, status: game.data.status as string, reviewNote: (game.data.review_note as string | null) ?? null } : null}
      ai={{
        connected: Boolean(conn),
        enabled: me?.ai_enabled !== false,
        left: limit === null ? null : Math.max(0, limit - spent),
        estimates: est ? { message: est.message, build: est.build, perChange: [1, 2, 3, 4, 5, 6].map((n) => est.changes(n)) } : null,
      }}
    />
  );
}
