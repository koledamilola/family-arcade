"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { Heart, Search, Star, Play, Gamepad2, Smartphone, Trophy } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import { CATEGORIES, cartridgeColor, categoryEmoji } from "@/lib/catalog";
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
  const newest = games[0];

  return (
    <main>
      {/* Hero: the carpet band */}
      <section className="carpet">
        <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 pt-8 pb-12 sm:pt-12 sm:pb-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div>
            <p className="font-display text-lg font-semibold text-sunny sm:text-xl">Hi {name}! 👋</p>
            <h1 className="mt-2 max-w-xl text-4xl leading-[1.05] sm:text-6xl">What are we playing today?</h1>
            {games.length > 0 && (
              <p className="mt-5 max-w-md text-lg text-white/80">
                <Num>{games.length}</Num> {games.length === 1 ? "game" : "games"}
                {creators > 0 && (
                  <>
                    {" "}from <Num>{creators}</Num> {creators === 1 ? "game maker" : "game makers"}
                  </>
                )}
                , played <Num>{totalPlays}</Num> {totalPlays === 1 ? "time" : "times"}.
              </p>
            )}
          </div>
          {newest && <Spotlight game={newest} />}
        </div>
      </section>
      <div className="bulbs" aria-hidden />

      <div className="mx-auto max-w-7xl px-4">
        {/* Filters */}
        <section className="mt-8 space-y-3" aria-label="Find a game">
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search games</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 h-5 w-5 -translate-y-1/2 text-ink/50" />
              <input
                className="input pl-12 text-lg"
                placeholder="Search games or makers"
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
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2">
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

        {/* Shelf of cartridges */}
        {shown.length === 0 ? (
          <EmptyState hasGames={games.length > 0} isAdmin={isAdmin} favorites={onlyFavorites} />
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map((g) => (
              <li key={g.id}>
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
      </div>
    </main>
  );
}

function toggled(set: Set<string>, id: string, on: boolean) {
  const next = new Set(set);
  if (on) next.add(id);
  else next.delete(id);
  return next;
}


function Num({ children }: { children: number }) {
  return <strong className="font-marquee font-normal text-sunny">{children.toLocaleString()}</strong>;
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`chip ${active ? "bg-ink text-white" : "hover:bg-cream"}`}
    >
      {children}
    </button>
  );
}

/** The newest game, shown big in the hero as a cartridge sliding into place. */
function Spotlight({ game }: { game: GameCard }) {
  return (
    <Link
      href={`/play/${game.slug}`}
      className="group animate-slot-in relative mx-auto block w-full max-w-lg rounded-[26px] border-2 border-ink p-3 pb-0 shadow-pop-lg"
      style={{ background: cartridgeColor(game.cover_color) }}
    >
      <span className="absolute -top-4 -left-3 z-10 -rotate-6 rounded-lg border-2 border-ink bg-sunny px-3 py-0.5 font-hand text-xl text-ink">
        Just added!
      </span>
      <div className="overflow-hidden rounded-2xl border-2 border-ink bg-white text-ink">
        <div className="aspect-video overflow-hidden border-b-2 border-ink">
          <GameCover
            title={game.title}
            thumbnailUrl={game.thumbnail_url}
            emoji={game.cover_emoji}
            color={game.cover_color}
            className="transition duration-300 group-hover:scale-[1.03]"
          />
        </div>
        <div className="flex items-center gap-4 p-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-2xl font-bold leading-tight">{game.title}</h2>
            {game.creator_name && <p className="mt-0.5 truncate font-hand text-2xl text-grape">made by {game.creator_name}</p>}
          </div>
          <span className="arcade-btn h-16 w-16 text-sm">
            <Play className="h-6 w-6 fill-current" aria-hidden />
            <span className="sr-only">Play {game.title}</span>
          </span>
        </div>
      </div>
      <div className="ridges mx-10 my-2.5 h-3" aria-hidden />
    </Link>
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
    <article
      className="group flex h-full flex-col rounded-[20px] border-2 border-ink p-2 pb-0 shadow-pop transition duration-150 hover:-translate-y-1 hover:shadow-pop-lg"
      style={{ background: cartridgeColor(game.cover_color) }}
    >
      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border-2 border-ink bg-white">
        <Link href={`/play/${game.slug}`} className="relative block aspect-[4/3] overflow-hidden border-b-2 border-ink" tabIndex={-1} aria-hidden>
          <GameCover
            title={game.title}
            thumbnailUrl={game.thumbnail_url}
            emoji={game.cover_emoji}
            color={game.cover_color}
            className="transition duration-300 group-hover:scale-105"
          />
          <span className="chip absolute top-2.5 left-2.5 bg-white/95 text-xs">
            {categoryEmoji(game.category)} {game.category}
          </span>
          <span className="absolute right-3 bottom-3 opacity-0 transition group-hover:opacity-100">
            <span className="arcade-btn h-14 w-14">
              <Play className="h-5 w-5 fill-current" />
            </span>
          </span>
        </Link>
        <div className="flex flex-1 flex-col p-3.5">
          <div className="flex items-start gap-2">
            <h2 className="flex-1 text-lg font-bold leading-snug">
              <Link href={`/play/${game.slug}`} className="rounded hover:text-ocean">
                {game.title}
              </Link>
            </h2>
            <button
              type="button"
              onClick={onFave}
              aria-pressed={favorite}
              aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
              className="-mt-0.5 rounded-full p-1 transition hover:scale-110"
            >
              <Star className={`h-6 w-6 ${favorite ? "fill-sunny text-ink" : "text-ink/35"}`} strokeWidth={2.25} />
            </button>
          </div>
          {game.creator_name && (
            <p className="-mt-0.5 origin-left -rotate-1 font-hand text-xl leading-tight text-grape">made by {game.creator_name}</p>
          )}
          {game.description && <p className="mt-2 line-clamp-2 text-sm text-ink/70">{game.description}</p>}
          <div className="mt-auto flex items-center gap-3 pt-4 text-sm font-semibold text-ink/70">
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
            <span className="ml-auto flex items-center gap-1.5 text-ink/45">
              {game.has_scores && <Trophy className="h-4 w-4" aria-label="Has leaderboard" />}
              {game.supports_touch && <Smartphone className="h-4 w-4" aria-label="Works on touch screens" />}
              {game.supports_gamepad && <Gamepad2 className="h-4 w-4" aria-label="Works with controllers" />}
            </span>
          </div>
        </div>
      </div>
      <div className="ridges mx-8 my-2 h-2.5" aria-hidden />
    </article>
  );
}

function EmptyState({ hasGames, isAdmin, favorites }: { hasGames: boolean; isAdmin: boolean; favorites: boolean }) {
  return (
    <div className="card mt-6 flex flex-col items-center p-10 text-center">
      <div className="text-6xl" aria-hidden>
        {favorites ? "⭐" : hasGames ? "🔍" : "🎁"}
      </div>
      <h2 className="mt-3 text-2xl font-bold">
        {favorites ? "No favorites yet" : hasGames ? "No games match that" : "No games yet!"}
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
