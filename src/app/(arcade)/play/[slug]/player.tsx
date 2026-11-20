"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { Expand, Heart, RotateCcw, Star, Gamepad2, Smartphone, Trophy, Keyboard } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { categoryEmoji, formatScore } from "@/lib/catalog";
import { GAME_SANDBOX } from "@/lib/game-shim";
import type { GameCard, LeaderboardRow } from "@/lib/types";
import { getLeaderboard, recordPlay, setFavorite, setLiked, submitScore } from "../../actions";

const SAVE_KEY = (gameId: string, userId: string) => `fa-save:${userId}:${gameId}`;
const noSubscribe = () => () => {};

function readSave(key: string) {
  try {
    return localStorage.getItem(key) ?? "{}";
  } catch {
    return "{}";
  }
}

export function Player({
  game,
  userId,
  initialLiked,
  initialFavorite,
  initialBoard,
  guest = false,
}: {
  game: GameCard;
  userId: string;
  initialLiked: boolean;
  initialFavorite: boolean;
  initialBoard: LeaderboardRow[];
  /** Someone playing from a share link: no account, so no likes, favorites or leaderboard. */
  guest?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [liked, setLikedState] = useState(initialLiked);
  const [likes, setLikes] = useState(game.like_count);
  const [favorite, setFavState] = useState(initialFavorite);
  const [board, setBoard] = useState(initialBoard);
  const [toast, setToast] = useState<string | null>(null);
  const [frameKey, setFrameKey] = useState(0);
  // This player's saved game data (kept in this browser), handed to the game as it starts.
  const savedJson = useSyncExternalStore(
    noSubscribe,
    () => readSave(SAVE_KEY(game.id, userId)),
    () => null,
  );
  const frameName = savedJson === null ? undefined : `fa-save:${savedJson}`;
  const [, startTransition] = useTransition();

  const src =
    game.kind === "url"
      ? game.external_url ?? "about:blank"
      : `/g/${game.storage_prefix}/${(game.entry_path ?? "index.html").split("/").map(encodeURIComponent).join("/")}`;

  useEffect(() => {
    if (!guest) recordPlay(game.id).catch(() => {});
  }, [game.id, guest]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3500);
  }, []);

  // Messages from the game (saves and scores).
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.source !== frameRef.current?.contentWindow) return;
      const msg = e.data as { __familyArcade?: number; type?: string; data?: unknown; score?: unknown };
      if (!msg || msg.__familyArcade !== 1) return;
      if (msg.type === "save" && msg.data && typeof msg.data === "object") {
        try {
          const json = JSON.stringify(msg.data);
          if (json.length < 4_000_000) localStorage.setItem(SAVE_KEY(game.id, userId), json);
        } catch {}
      }
      if (msg.type === "score" && game.has_scores && !guest && typeof msg.score === "number") {
        const score = msg.score;
        startTransition(async () => {
          try {
            setBoard(await submitScore(game.id, score));
            showToast(`🏆 ${game.score_label}: ${formatScore(score)} saved!`);
          } catch {
            showToast("Couldn't save that score 😢");
          }
        });
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [game.id, game.has_scores, game.score_label, userId, showToast, guest]);

  // Refresh the leaderboard now and then so you can see family members' scores.
  useEffect(() => {
    if (!game.has_scores || guest) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === "visible") getLeaderboard(game.id).then(setBoard).catch(() => {});
    }, 30_000);
    return () => window.clearInterval(t);
  }, [game.id, game.has_scores, guest]);

  function focusGame() {
    frameRef.current?.focus();
  }

  async function goFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await el.requestFullscreen({ navigationUI: "hide" });
      focusGame();
    } catch {
      showToast("Fullscreen isn't available on this device.");
    }
  }

  function restart() {
    setFrameKey((k) => k + 1);
  }

  function toggleLike() {
    const next = !liked;
    setLikedState(next);
    setLikes((n) => n + (next ? 1 : -1));
    startTransition(async () => {
      try {
        await setLiked(game.id, next);
      } catch {
        setLikedState(!next);
        setLikes((n) => n + (next ? -1 : 1));
      }
    });
  }

  function toggleFave() {
    const next = !favorite;
    setFavState(next);
    startTransition(async () => {
      try {
        await setFavorite(game.id, next);
      } catch {
        setFavState(!next);
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section>
        {/* The cabinet: marquee, screen, control panel */}
        <div className="rounded-[24px] border-2 border-ink bg-ink p-2 text-white shadow-pop-lg [--ledge:#07051a] sm:p-3">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-1 px-2 pt-1 pb-3 sm:px-3">
            <h1 className="text-2xl leading-tight text-sunny sm:text-4xl">{game.title}</h1>
            {game.creator_name && <p className="pb-0.5 font-hand text-2xl text-white/85">made by {game.creator_name}</p>}
          </div>
          <div ref={stageRef} className="game-stage relative overflow-hidden rounded-2xl border-2 border-black bg-black">
            {frameName !== undefined ? (
              <iframe
                key={frameKey}
                ref={frameRef}
                name={game.kind === "url" ? undefined : frameName}
                src={src}
                title={game.title}
                sandbox={game.kind === "url" ? `${GAME_SANDBOX} allow-same-origin` : GAME_SANDBOX}
                allow="fullscreen; gamepad; autoplay; accelerometer; gyroscope"
                referrerPolicy="no-referrer"
                className="block aspect-[4/3] max-h-[78vh] w-full bg-black sm:aspect-video"
                onLoad={focusGame}
              />
            ) : (
              <div className="grid aspect-video place-items-center text-4xl text-white">⏳</div>
            )}
            {toast && (
              <div
                role="status"
                className="animate-pop-in absolute top-3 left-1/2 -translate-x-1/2 rounded-xl border-2 border-ink bg-sunny px-4 py-2 font-display font-bold text-ink shadow-pop"
              >
                {toast}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1 pt-3 pb-1 sm:px-2">
            <button type="button" className="btn btn-sunny" onClick={goFullscreen}>
              <Expand className="h-5 w-5" /> Fullscreen
            </button>
            <button type="button" className="btn btn-white" onClick={restart}>
              <RotateCcw className="h-5 w-5" /> Restart
            </button>
            <span className="flex-1" />
            {!guest && (<>
            <button
              type="button"
              className={`btn ${liked ? "btn-berry" : "btn-white"}`}
              onClick={toggleLike}
              aria-pressed={liked}
              aria-label={liked ? `Unlike (${likes} likes)` : `Like (${likes} likes)`}
            >
              <Heart className={`h-5 w-5 ${liked ? "fill-current" : ""}`} /> {likes}
            </button>
            <button
              type="button"
              className={`btn ${favorite ? "btn-sunny" : "btn-white"}`}
              onClick={toggleFave}
              aria-pressed={favorite}
            >
              <Star className={`h-5 w-5 ${favorite ? "fill-current" : ""}`} /> {favorite ? "Favorite!" : "Favorite"}
            </button>
            </>)}
          </div>
        </div>

        <div className="card mt-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">
              {categoryEmoji(game.category)} {game.category}
            </span>
            {!guest && <span className="chip">🔥 {game.play_count.toLocaleString()} plays</span>}
            {game.supports_touch && (
              <span className="chip"><Smartphone className="h-4 w-4" /> Touch friendly</span>
            )}
            {game.supports_gamepad && (
              <span className="chip"><Gamepad2 className="h-4 w-4" /> Controller ready</span>
            )}
          </div>
          {game.description && <p className="mt-4 max-w-prose whitespace-pre-line text-ink/85">{game.description}</p>}
          {game.controls && (
            <div className="mt-5 rounded-xl border-2 border-dashed border-ink/30 bg-cream p-4">
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Keyboard className="h-5 w-5" /> How to play
              </h2>
              <p className="mt-1 whitespace-pre-line">{game.controls}</p>
            </div>
          )}
          <p className="mt-4 text-xs text-ink/55">
            Tip: click the game first so it hears your keyboard. Press Esc to leave fullscreen.
          </p>
        </div>
      </section>

      <aside>
        {guest ? (
          <div className="card p-5 text-center">
            <div className="text-5xl" aria-hidden>🕹️</div>
            <p className="mt-2 font-display text-lg font-semibold">Made in a Family Arcade</p>
            <p className="mt-1 text-sm text-ink/60">
              Families make games together here, with an AI helper that guides every step.
            </p>
            <a href="/login" className="btn btn-mint btn-sm mt-4">Start your family&apos;s arcade</a>
          </div>
        ) : game.has_scores ? (
          <Leaderboard board={board} userId={userId} label={game.score_label} />
        ) : (
          <div className="card p-5 text-center">
            <div className="text-5xl" aria-hidden>🎉</div>
            <p className="mt-2 font-display text-lg font-semibold">Have fun playing!</p>
            <p className="mt-1 text-sm text-ink/60">This game doesn&apos;t have a leaderboard yet.</p>
          </div>
        )}
      </aside>
    </div>
  );
}

const RANKS = [
  { text: "1st", color: "#ffc83d" },
  { text: "2nd", color: "#c9d3e6" },
  { text: "3rd", color: "#f0a36b" },
];

function Leaderboard({ board, userId, label }: { board: LeaderboardRow[]; userId: string; label: string }) {
  return (
    <div className="overflow-hidden rounded-2xl border-2 border-ink bg-ink text-white shadow-pop lg:sticky lg:top-24">
      <div className="flex items-center gap-2 border-b-2 border-white/10 px-5 py-4">
        <Trophy className="h-6 w-6 text-sunny" />
        <h2 className="font-marquee text-xl font-normal text-sunny">Leaderboard</h2>
      </div>
      {board.length === 0 ? (
        <p className="p-6 text-center text-white/75">No scores yet. Be the first! 🚀</p>
      ) : (
        <ol>
          {board.map((row, i) => {
            const rank = RANKS[i];
            const you = row.user_id === userId;
            return (
              <li
                key={row.user_id}
                className={`flex items-center gap-3 border-l-4 px-4 py-2.5 ${
                  you ? "border-ocean bg-white/10" : "border-transparent"
                }`}
              >
                <span
                  className="w-11 shrink-0 font-marquee text-base uppercase"
                  style={{ color: rank?.color ?? "rgb(255 255 255 / 0.55)" }}
                >
                  {rank?.text ?? `${i + 1}th`}
                </span>
                <Avatar url={row.avatar_url} emoji={row.avatar_emoji} name={row.display_name} size={30} />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {row.display_name}
                  {you && <span className="ml-1 text-xs text-sky">(you)</span>}
                </span>
                <span className="font-marquee text-lg tabular-nums" style={{ color: rank?.color ?? "#fff" }}>
                  {formatScore(row.best)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="border-t-2 border-white/10 px-5 py-2.5 text-xs text-white/55">Best {label.toLowerCase()} for each player</p>
    </div>
  );
}
