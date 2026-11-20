"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Eye, EyeOff, Link2Off, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import { ShareButton } from "@/components/ShareButton";
import { categoryEmoji } from "@/lib/catalog";
import type { GameCard, GameStatus } from "@/lib/types";
import { deleteGame, newShareLink, setGamePublished, setShareEnabled } from "./actions";

const STATUS_CHIP: Record<GameStatus, { text: string; cls: string }> = {
  published: { text: "Live", cls: "border-mint bg-mint/10 text-mint" },
  hidden: { text: "Hidden", cls: "border-berry bg-berry/10 text-berry" },
  pending: { text: "Needs approval", cls: "border-sunny bg-sunny/20 text-ink" },
  rejected: { text: "Sent back", cls: "border-tangerine bg-tangerine/10 text-tangerine" },
  draft: { text: "Draft", cls: "border-ink/30 text-ink/60" },
};

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
        <p className="mt-3 font-display text-xl font-semibold">No games yet. Upload one, or make one in the Studio!</p>
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
        {games.map((g) => {
          const chip = STATUS_CHIP[g.status];
          const live = g.status === "published";
          return (
            <li key={g.id} className={`card p-3 ${busy === g.id ? "opacity-60" : ""}`}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="h-24 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-ink sm:w-32">
                <GameCover title={g.title} thumbnailUrl={g.thumbnail_url} emoji={g.cover_emoji} color={g.cover_color} small />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-xl font-bold">{g.title}</h3>
                  <span className={`chip text-xs ${chip.cls}`}>{chip.text}</span>
                  {live && !g.share_enabled && <span className="chip text-xs text-ink/60">Sharing off</span>}
                </div>
                <p className="text-sm text-ink/70">
                  {categoryEmoji(g.category)} {g.category}
                  {g.creator_name && <> · by <strong>{g.creator_name}</strong></>} · {kindLabel(g.kind)}
                </p>
                <p className="mt-1 text-sm font-bold text-ink/60">
                  🔥 {g.play_count} plays · 💖 {g.like_count} likes{g.has_scores && " · 🏆 leaderboard"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2 sm:max-w-[16rem] sm:justify-end">
                <Link href={`/play/${g.slug}`} className="btn btn-white btn-sm" title="Play">
                  <Play className="h-4 w-4" /> Play
                </Link>
                <Link href={`/admin/games/${g.id}`} className="btn btn-ocean btn-sm">
                  <Pencil className="h-4 w-4" /> Edit
                </Link>
                {(live || g.status === "hidden") && (
                  <button
                    type="button"
                    className="btn btn-sunny btn-sm"
                    disabled={busy === g.id}
                    onClick={() => run(g.id, () => setGamePublished(g.id, !live))}
                  >
                    {live ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    {live ? "Hide" : "Show"}
                  </button>
                )}
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
              </div>
              {live && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t-2 border-dashed border-ink/10 pt-3 sm:justify-end">
                  <span className="mr-auto text-sm font-semibold text-ink/60">
                    {g.share_enabled ? "🔗 Anyone with the link can play" : "🔒 Only your family can play"}
                  </span>
                  {g.share_enabled ? (
                    <>
                      <ShareButton path={`/s/${g.share_token}`} title={g.title} className="btn btn-white btn-sm" />
                      <button
                        type="button"
                        className="btn btn-white btn-sm"
                        disabled={busy === g.id}
                        title="The old link stops working"
                        onClick={() => {
                          if (window.confirm("Make a new share link? The old link will stop working.")) run(g.id, () => newShareLink(g.id));
                        }}
                      >
                        <RefreshCw className="h-4 w-4" /> New link
                      </button>
                      <button
                        type="button"
                        className="btn btn-white btn-sm"
                        disabled={busy === g.id}
                        onClick={() => run(g.id, () => setShareEnabled(g.id, false))}
                      >
                        <Link2Off className="h-4 w-4" /> Turn off sharing
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-white btn-sm"
                      disabled={busy === g.id}
                      onClick={() => run(g.id, () => setShareEnabled(g.id, true))}
                    >
                      🔗 Turn on share link
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function kindLabel(kind: GameCard["kind"]) {
  return kind === "html" ? "HTML file" : kind === "zip" ? "Zip folder" : "Web link";
}
