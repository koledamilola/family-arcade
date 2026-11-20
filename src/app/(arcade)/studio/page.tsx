import type { Metadata } from "next";
import Link from "next/link";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { getConnection } from "@/lib/ai";
import { NewProject } from "./new-project";

export const metadata: Metadata = { title: "Game Studio" };
export const maxDuration = 60;

type Row = { id: string; title: string; stage: string; updated_at: string; owner_id: string; plan: { emoji?: string } | null };

export default async function StudioHome() {
  const { user, profile, family } = await requireMember();
  const admin = createAdminClient();
  const isParent = profile.member_role === "parent";

  const [{ data: mine }, { data: family_projects }, conn, { data: people }] = await Promise.all([
    admin.from("studio_projects").select("id, title, stage, updated_at, owner_id, plan").eq("owner_id", user.id).order("updated_at", { ascending: false }),
    isParent
      ? admin.from("studio_projects").select("id, title, stage, updated_at, owner_id, plan").eq("family_id", family.id).neq("owner_id", user.id).order("updated_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [] as Row[] }),
    getConnection(family.id),
    admin.from("profiles").select("id, display_name, avatar_emoji").eq("family_id", family.id),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, `${p.avatar_emoji} ${p.display_name}`]));

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="text-3xl font-bold sm:text-4xl">🛠️ Game Studio</h1>
      <p className="mt-1 max-w-2xl text-ink/70">
        Tell the coach your idea. It asks a few questions, writes a plan with you, then builds the game. You can play it
        straight away and keep improving it.
      </p>

      {!conn && (
        <p className="card mt-5 border-sunny p-4 font-semibold">
          {isParent ? (
            <>
              ⚡ Connect an AI account first so the Studio can build games.{" "}
              <Link href="/admin/ai" className="text-ocean underline">Connect AI</Link>
            </>
          ) : (
            "⚡ The AI helper isn't set up yet. Ask a parent to connect it."
          )}
        </p>
      )}

      <NewProject disabled={!conn} isKid={profile.member_role === "kid"} />

      <ProjectList title="My games" rows={(mine as Row[] | null) ?? []} empty="No projects yet. Start one above!" />
      {isParent && (
        <ProjectList title="The family's projects" rows={(family_projects as Row[] | null) ?? []} names={names} empty="Nobody else has started a game yet." />
      )}
    </main>
  );
}

const STAGE = { interview: "💬 Planning", plan: "📋 Plan ready", built: "🎮 Playable" } as Record<string, string>;

function ProjectList({ title, rows, names, empty }: { title: string; rows: Row[]; names?: Record<string, string>; empty: string }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-2xl font-bold">{title}</h2>
      {rows.length === 0 ? (
        <p className="card p-5 text-ink/60">{empty}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/studio/${r.id}`} className="card flex items-center gap-3 p-4 transition hover:-translate-y-0.5">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-sunny text-2xl" aria-hidden>
                  {r.plan?.emoji ?? "💡"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{r.title}</span>
                  <span className="block text-sm text-ink/60">
                    {STAGE[r.stage]}
                    {names && <> · {names[r.owner_id] ?? "Someone"}</>} · {new Date(r.updated_at).toLocaleDateString()}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
