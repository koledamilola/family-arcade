import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlayer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameCard, LeaderboardRow } from "@/lib/types";
import { Player } from "./player";

export async function generateMetadata(props: PageProps<"/play/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const supabase = await createClient();
  const { data } = await supabase.from("games").select("title").eq("slug", slug).maybeSingle();
  return { title: data?.title ?? "Game" };
}

export default async function PlayPage(props: PageProps<"/play/[slug]">) {
  const { slug } = await props.params;
  const { user, profile } = await requirePlayer();
  const supabase = await createClient();

  const { data: game } = await supabase.from("game_cards").select("*").eq("slug", slug).maybeSingle<GameCard>();
  if (!game) notFound();

  const [like, fave, board] = await Promise.all([
    supabase.from("likes").select("game_id").match({ user_id: user.id, game_id: game.id }).maybeSingle(),
    supabase.from("favorites").select("game_id").match({ user_id: user.id, game_id: game.id }).maybeSingle(),
    game.has_scores ? supabase.rpc("game_leaderboard", { p_game_id: game.id }) : Promise.resolve({ data: [] }),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 flex items-center gap-2 text-sm font-bold">
        <Link href="/" className="btn btn-white btn-sm">
          ← All games
        </Link>
        {!game.published && (
          <span className="chip border-berry bg-berry/10 text-berry">Hidden: only admins can see this</span>
        )}
        {profile.role === "admin" && (
          <Link href={`/admin/games/${game.id}`} className="btn btn-grape btn-sm ml-auto">
            ✏️ Edit game
          </Link>
        )}
      </nav>
      <Player
        game={game}
        userId={user.id}
        initialLiked={Boolean(like.data)}
        initialFavorite={Boolean(fave.data)}
        initialBoard={(board.data as LeaderboardRow[] | null) ?? []}
      />
    </main>
  );
}
