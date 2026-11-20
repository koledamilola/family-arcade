"use client";

import { useMemo, useState, useTransition } from "react";
import { Pause, Play, Search, Trash2 } from "lucide-react";
import type { Family, Profile } from "@/lib/types";
import { deleteFamily, deleteUserAccount, setFamilyStatus } from "./actions";

export type FamilyRow = Family & {
  members: Pick<Profile, "id" | "member_role" | "display_name" | "email" | "username" | "avatar_emoji">[];
  gameCount: number;
  pendingCount: number;
  plays: number;
};

const ROLE_ORDER = { parent: 0, adult: 1, kid: 2 } as const;

export function FamiliesTable({ families, myFamilyId, myId }: { families: FamilyRow[]; myFamilyId: string | null; myId: string }) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(key);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      setBusy(null);
    });
  }

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return families;
    return families.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.members.some((m) => [m.display_name, m.email, m.username].some((s) => s?.toLowerCase().includes(q))),
    );
  }, [families, query]);

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-2xl font-bold">Families</h2>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search families or people</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink/50" />
          <input className="input pl-9" placeholder="Search families, names, emails" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </div>
      {error && (
        <p role="alert" className="mb-3 rounded-2xl border-2 border-berry bg-berry/10 px-4 py-3 font-semibold text-berry">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {shown.map((f) => {
          const mine = f.id === myFamilyId;
          const members = [...f.members].sort((a, b) => ROLE_ORDER[a.member_role ?? "kid"] - ROLE_ORDER[b.member_role ?? "kid"]);
          const parents = members.filter((m) => m.member_role === "parent");
          return (
            <li key={f.id} className={`card p-4 ${busy?.startsWith(f.id) ? "opacity-60" : ""}`}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    {f.name}
                    {mine && <span className="chip text-xs">your family</span>}
                    {f.status === "suspended" && <span className="chip border-berry bg-berry/10 text-xs text-berry">Paused</span>}
                  </p>
                  <p className="text-sm text-ink/60">
                    {parents.map((p) => p.email).filter(Boolean).join(", ") || "no parent email"} · since{" "}
                    {new Date(f.created_at).toLocaleDateString()}
                  </p>
                  <p className="mt-1 text-sm font-bold text-ink/60">
                    👥 {members.length} members · 🎮 {f.gameCount} games{f.pendingCount ? ` (${f.pendingCount} waiting)` : ""} · 🔥 {f.plays} plays
                  </p>
                </div>
                {!mine && (
                  <div className="flex w-full gap-2 sm:w-auto">
                    {f.status === "active" ? (
                      <button className="btn btn-sunny btn-sm" disabled={busy !== null} onClick={() => run(f.id, () => setFamilyStatus(f.id, "suspended"))}>
                        <Pause className="h-4 w-4" /> Pause
                      </button>
                    ) : (
                      <button className="btn btn-mint btn-sm" disabled={busy !== null} onClick={() => run(f.id, () => setFamilyStatus(f.id, "active"))}>
                        <Play className="h-4 w-4" /> Unpause
                      </button>
                    )}
                    <button
                      className="btn btn-berry btn-sm"
                      disabled={busy !== null}
                      onClick={() => {
                        const typed = window.prompt(`Delete "${f.name}" and ALL its accounts, games and files? Type the family name to confirm.`);
                        if (typed?.trim() === f.name) run(f.id, () => deleteFamily(f.id));
                      }}
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                )}
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-ocean">Show members</summary>
                <ul className="mt-2 divide-y-2 divide-ink/10 rounded-xl bg-cream">
                  {members.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
                      <span aria-hidden>{m.avatar_emoji}</span>
                      <span className="font-semibold">{m.display_name}</span>
                      <span className="chip text-xs">{m.member_role}</span>
                      <span className="text-ink/60">{m.member_role === "kid" ? `@${m.username}` : m.email}</span>
                      <span className="flex-1" />
                      {m.id !== myId && (
                        <button
                          className="text-xs font-bold text-berry underline"
                          disabled={busy !== null}
                          onClick={() => {
                            if (window.confirm(`Delete ${m.display_name}'s account? This can't be undone.`)) {
                              run(`${f.id}:${m.id}`, () => deleteUserAccount(m.id));
                            }
                          }}
                        >
                          Delete account
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
