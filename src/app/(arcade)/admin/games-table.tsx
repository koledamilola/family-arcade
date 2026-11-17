"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Pencil, Play, Trash2 } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import { categoryEmoji } from "@/lib/catalog";
import type { GameCard } from "@/lib/types";
import { deleteGame, setGamePublished } from "./actions";

export function GamesTable({ games }: { games: GameCard[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>) {
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error ?? "Something went wrong.");
      setBusy(null);
    });
  }

  if (games.length === 0) {
    return (
      <div className="card p-10 text-center">
        <div className="text-6xl" aria-hidden>🎁</div>
        <p className="mt-3 font-display text-xl font-semibold">No games yet. Add the first one!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-2xl border-2 border-berry bg-berry/10 px-4 py-3 font-semibold text-berry">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {games.map((g) => (
          <li key={g.id} className={`card flex flex-col gap-4 p-3 sm:flex-row sm:items-center ${busy === g.id ? "opacity-60" : ""}`}>
            <div className="h-24 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-ink sm:w-32">
              <GameCover title={g.title} thumbnailUrl={g.thumbnail_url} emoji={g.cover_emoji} color={g.cover_color} small />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-xl font-bold">{g.title}</h3>
                {g.published ? (
                  <span className="chip border-mint bg-mint/10 text-xs text-mint">Live</span>
                ) : (
                  <span className="chip border-berry bg-berry/10 text-xs text-berry">Hidden</span>
                )}
              </div>
              <p className="text-sm text-ink/70">
                {categoryEmoji(g.category)} {g.category}
                {g.creator_name && <> · by <strong>{g.creator_name}</strong></>} · {kindLabel(g.kind)}
              </p>
              <p className="mt-1 text-sm font-bold text-ink/60">
                🔥 {g.play_count} plays · 💖 {g.like_count} likes{g.has_scores && " · 🏆 leaderboard"}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/play/${g.slug}`} className="btn btn-white btn-sm" title="Play">
                <Play className="h-4 w-4" /> Play
              </Link>
              <Link href={`/admin/games/${g.id}`} className="btn btn-ocean btn-sm">
                <Pencil className="h-4 w-4" /> Edit
              </Link>
              <button
                type="button"
                className="btn btn-sunny btn-sm"
                disabled={busy === g.id}
                onClick={() => run(g.id, () => setGamePublished(g.id, !g.published))}
              >
                {g.published ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                {g.published ? "Hide" : "Show"}
              </button>
              <button
                type="button"
                className="btn btn-berry btn-sm"
                disabled={busy === g.id}
                onClick={() => {
                  if (window.confirm(`Delete "${g.title}" forever? Its scores and likes will be deleted too.`)) {
                    run(g.id, () => deleteGame(g.id));
                  }
                }}
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function kindLabel(kind: GameCard["kind"]) {
  return kind === "html" ? "HTML file" : kind === "zip" ? "Zip folder" : "Web link";
}
