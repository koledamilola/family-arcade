import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import type { Family, Profile } from "@/lib/types";
import { FamiliesTable, type FamilyRow } from "./families-table";

export const metadata: Metadata = { title: "Platform" };

export default async function PlatformPage() {
  const { profile } = await requirePlatformAdmin();
  const admin = createAdminClient();

  const [{ data: families }, { data: people }, { data: games }] = await Promise.all([
    admin.from("families").select("*").order("created_at", { ascending: false }),
    admin.from("profiles").select("id, family_id, member_role, display_name, email, username, avatar_emoji, created_at"),
    admin.from("games").select("family_id, status, play_count"),
  ]);

  const allPeople = (people ?? []) as Pick<Profile, "id" | "family_id" | "member_role" | "display_name" | "email" | "username" | "avatar_emoji" | "created_at">[];
  const rows: FamilyRow[] = ((families ?? []) as Family[]).map((f) => {
    const members = allPeople.filter((p) => p.family_id === f.id);
    const famGames = (games ?? []).filter((g) => g.family_id === f.id);
    return {
      ...f,
      members,
      gameCount: famGames.length,
      pendingCount: famGames.filter((g) => g.status === "pending").length,
      plays: famGames.reduce((n, g) => n + (g.play_count as number), 0),
    };
  });
  const unattached = allPeople.filter((p) => !p.family_id);

  const stats = [
    { label: "Families", value: rows.length },
    { label: "Parents", value: allPeople.filter((p) => p.member_role === "parent").length },
    { label: "Kids", value: allPeople.filter((p) => p.member_role === "kid").length },
    { label: "Games", value: (games ?? []).length },
  ];

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">
      <h1 className="text-3xl font-bold sm:text-4xl">🌐 Platform</h1>
      <p className="mt-1 text-ink/70">Every family on Family Arcade. Only platform admins can see this page.</p>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="card p-4">
            <dt className="text-sm font-bold text-ink/60">{s.label}</dt>
            <dd className="font-marquee text-3xl">{s.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>

      <FamiliesTable families={rows} myFamilyId={profile?.family_id ?? null} myId={profile?.id ?? ""} />

      {unattached.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xl font-bold">Signed up, no family yet ({unattached.length})</h2>
          <ul className="mt-2 divide-y-2 divide-ink/10 rounded-2xl border-2 border-ink bg-white">
            {unattached.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-3 px-4 py-2 text-sm">
                <span className="font-semibold">{p.display_name}</span>
                <span className="text-ink/60">{p.email}</span>
                <span className="ml-auto text-ink/50">{new Date(p.created_at).toLocaleDateString()}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
