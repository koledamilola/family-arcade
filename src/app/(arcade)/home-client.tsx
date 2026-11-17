"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Heart, Search, Star, Play, Gamepad2, Smartphone, Trophy } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import { CATEGORIES, categoryEmoji } from "@/lib/catalog";
import type { GameCard } from "@/lib/types";
import { setFavorite, setLiked } from "./actions";

type Sort = "new" | "played" | "liked" | "az";

export function HomeClient({
  name,
  isAdmin,
  games,
  likedIds,
  favoriteIds,
  initialView,
}: {
  name: string;
  isAdmin: boolean;
  games: GameCard[];
  likedIds: string[];
  favoriteIds: string[];
  initialView: "all" | "favorites";
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = useState(initialView === "favorites");
  const [sort, setSort] = useState<Sort>("new");
  const [liked, setLikedSet] = useState(() => new Set(likedIds));
  const [faves, setFaves] = useState(() => new Set(favoriteIds));
  const [likeDelta, setLikeDelta] = useState<Record<string, number>>({});
  const [, startTransition] = useTransition();

  const usedCategories = useMemo(() => {
    const present = new Set(games.map((g) => g.category));
    return CATEGORIES.filter((c) => present.has(c.name));
  }, [games]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = games.filter((g) => {
      if (category && g.category !== category) return false;
      if (onlyFavorites && !faves.has(g.id)) return false;
      if (!q) return true;
      return [g.title, g.description, g.creator_name, g.category].some((s) => s.toLowerCase().includes(q));
    });
    const likes = (g: GameCard) => g.like_count + (likeDelta[g.id] ?? 0);
    return list.sort((a, b) => {
      if (sort === "played") return b.play_count - a.play_count;
      if (sort === "liked") return likes(b) - likes(a);
      if (sort === "az") return a.title.localeCompare(b.title);
      return b.created_at.localeCompare(a.created_at);
    });
  }, [games, query, category, onlyFavorites, faves, sort, likeDelta]);

  function toggleLike(id: string) {
    const next = !liked.has(id);
    setLikedSet((s) => toggled(s, id, next));
    setLikeDelta((d) => ({ ...d, [id]: (d[id] ?? 0) + (next ? 1 : -1) }));
    startTransition(async () => {
      try {
        await setLiked(id, next);
      } catch {
        setLikedSet((s) => toggled(s, id, !next));
        setLikeDelta((d) => ({ ...d, [id]: (d[id] ?? 0) + (next ? -1 : 1) }));
      }
    });
  }

  function toggleFave(id: string) {
    const next = !faves.has(id);
    setFaves((s) => toggled(s, id, next));
    startTransition(async () => {
      try {
        await setFavorite(id, next);
      } catch {
        setFaves((s) => toggled(s, id, !next));
      }
    });
  }

  const totalPlays = games.reduce((n, g) => n + g.play_count, 0);
  const creators = new Set(games.map((g) => g.creator_name).filter(Boolean)).size;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:py-8">
      {/* Hero */}
      <section className="card relative overflow-hidden bg-ocean p-6 text-white sm:p-8">
        <div aria-hidden className="pointer-events-none absolute -top-6 -right-4 text-[9rem] opacity-20 sm:text-[12rem]">
          🎮
        </div>
        <p className="font-display text-lg font-semibold text-sunny">Hi {name}! 👋</p>
        <h1 className="mt-1 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">What are we playing today?</h1>
        <div className="mt-5 flex flex-wrap gap-2 sm:gap-3">
          <Stat emoji="🕹️" value={games.length} label={games.length === 1 ? "game" : "games"} />
          <Stat emoji="🎨" value={creators} label={creators === 1 ? "game maker" : "game makers"} />
          <Stat emoji="🔥" value={totalPlays} label="plays" />
        </div>
      </section>

      {/* Filters */}
      <section className="mt-6 space-y-3" aria-label="Find a game">
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1">
            <span className="sr-only">Search games</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink/50" />
            <input
              className="input pl-12 text-lg"
              placeholder="Search games, makers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 font-display font-semibold">
            Sort
            <select className="input w-auto py-2" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="new">✨ Newest</option>
              <option value="played">🔥 Most played</option>
              <option value="liked">💖 Most liked</option>
              <option value="az">🔤 A to Z</option>
            </select>
          </label>
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <FilterChip active={!category && !onlyFavorites} onClick={() => { setCategory(null); setOnlyFavorites(false); }}>
            🌈 All
          </FilterChip>
          <FilterChip active={onlyFavorites} onClick={() => setOnlyFavorites((v) => !v)}>
            ⭐ My favorites
          </FilterChip>
          {usedCategories.map((c) => (
            <FilterChip
              key={c.name}
              active={category === c.name}
              onClick={() => setCategory((cur) => (cur === c.name ? null : c.name))}
            >
              {c.emoji} {c.name}
            </FilterChip>
          ))}
        </div>
      </section>

      {/* Grid */}
      {shown.length === 0 ? (
        <EmptyState hasGames={games.length > 0} isAdmin={isAdmin} favorites={onlyFavorites} />
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((g, i) => (
            <li key={g.id} className="animate-pop-in" style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}>
              <GameTile
                game={g}
                liked={liked.has(g.id)}
                favorite={faves.has(g.id)}
                likes={g.like_count + (likeDelta[g.id] ?? 0)}
                onLike={() => toggleLike(g.id)}
                onFave={() => toggleFave(g.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function toggled(set: Set<string>, id: string, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}

function Stat({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-2xl border-2 border-ink bg-white px-3 py-1.5 font-display font-semibold text-ink shadow-pop-sm">
      <span aria-hidden>{emoji}</span>
      <span className="text-lg">{value.toLocaleString()}</span>
      <span className="text-ink/70">{label}</span>
    </span>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip ${active ? "bg-sunny shadow-pop-sm" : "hover:bg-cream"}`}
    >
      {children}
    </button>
  );
}

function GameTile({
  game,
  liked,
  favorite,
  likes,
  onLike,
  onFave,
}: {
  game: GameCard;
  liked: boolean;
  favorite: boolean;
  likes: number;
  onLike: () => void;
  onFave: () => void;
}) {
  return (
    <article className="card group flex h-full flex-col overflow-hidden transition hover:-translate-y-1 hover:shadow-pop-lg">
      <Link href={`/play/${game.slug}`} className="relative block aspect-[4/3] overflow-hidden border-b-[3px] border-ink">
        <GameCover
          title={game.title}
          thumbnailUrl={game.thumbnail_url}
          emoji={game.cover_emoji}
          color={game.cover_color}
          className="transition duration-300 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3 chip bg-white/95 text-xs">
          {categoryEmoji(game.category)} {game.category}
        </span>
        <span className="absolute inset-0 grid place-items-center bg-ink/0 opacity-0 transition group-hover:bg-ink/25 group-hover:opacity-100">
          <span className="btn btn-sunny text-lg">
            <Play className="h-5 w-5 fill-current" /> Play
          </span>
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start gap-2">
          <h2 className="flex-1 text-xl font-bold leading-tight">
            <Link href={`/play/${game.slug}`} className="hover:text-ocean">
              {game.title}
            </Link>
          </h2>
          <button
            type="button"
            onClick={onFave}
            aria-pressed={favorite}
            aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
            className="rounded-full p-1 transition hover:scale-110"
          >
            <Star className={`h-6 w-6 ${favorite ? "fill-sunny text-ink" : "text-ink/40"}`} strokeWidth={2.5} />
          </button>
        </div>
        {game.creator_name && <p className="mt-0.5 text-sm font-bold text-grape">by {game.creator_name}</p>}
        {game.description && <p className="mt-2 line-clamp-2 text-sm text-ink/70">{game.description}</p>}
        <div className="mt-auto flex items-center gap-3 pt-4 text-sm font-bold text-ink/70">
          <button
            type="button"
            onClick={onLike}
            aria-pressed={liked}
            aria-label={liked ? "Unlike" : "Like"}
            className={`inline-flex items-center gap-1 rounded-full border-2 px-2.5 py-0.5 transition hover:scale-105 ${
              liked ? "border-berry bg-berry text-white" : "border-ink/20 hover:border-berry"
            }`}
          >
            <Heart className={`h-4 w-4 ${liked ? "fill-current" : ""}`} strokeWidth={2.5} /> {likes}
          </button>
          <span className="inline-flex items-center gap-1" title="Plays">
            🔥 {game.play_count.toLocaleString()}
          </span>
          <span className="ml-auto flex items-center gap-1.5 text-ink/50">
            {game.has_scores && <Trophy className="h-4 w-4" aria-label="Has leaderboard" />}
            {game.supports_touch && <Smartphone className="h-4 w-4" aria-label="Works on touch screens" />}
            {game.supports_gamepad && <Gamepad2 className="h-4 w-4" aria-label="Works with controllers" />}
          </span>
        </div>
      </div>
    </article>
  );
}

function EmptyState({ hasGames, isAdmin, favorites }: { hasGames: boolean; isAdmin: boolean; favorites: boolean }) {
  return (
    <div className="card mt-6 flex flex-col items-center p-10 text-center">
      <div className="animate-float text-6xl" aria-hidden>
        {favorites ? "⭐" : hasGames ? "🔍" : "🎁"}
      </div>
      <h2 className="mt-3 text-2xl font-bold">
        {favorites
          ? "No favorites yet"
          : hasGames
            ? "No games match that"
            : "No games yet!"}
      </h2>
      <p className="mt-1 text-ink/70">
        {favorites
          ? "Tap the star on any game to save it here."
          : hasGames
            ? "Try a different search or category."
            : isAdmin
              ? "Add the first game from the admin page."
              : "A grown-up will add some soon. Check back!"}
      </p>
      {!hasGames && isAdmin && (
        <Link href="/admin/games/new" className="btn btn-mint mt-5">
          ➕ Add a game
        </Link>
      )}
    </div>
  );
}
