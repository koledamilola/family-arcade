import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameCard, LeaderboardRow } from "@/lib/types";
import { ShareButton } from "@/components/ShareButton";
import { Player } from "./player";

export async function generateMetadata(props: PageProps<"/play/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const { family } = await requireMember();
  const supabase = await createClient();
  const { data } = await supabase.from("games").select("title").eq("family_id", family.id).eq("slug", slug).maybeSingle();
  return { title: data?.title ?? "Game" };
}

const STATUS_NOTE: Record<string, string> = {
  draft: "Draft: only the maker and parents can see this",
  pending: "Waiting for a parent to approve",
  hidden: "Hidden: only parents can see this",
  rejected: "Sent back by a parent",
};

export default async function PlayPage(props: PageProps<"/play/[slug]">) {
  const { slug } = await props.params;
  const { user, profile, family } = await requireMember();
  const supabase = await createClient();

  const { data: game } = await supabase
    .from("game_cards")
    .select("*")
    .eq("family_id", family.id)
    .eq("slug", slug)
    .maybeSingle<GameCard>();
  if (!game) notFound();

  const [like, fave, board] = await Promise.all([
    supabase.from("likes").select("game_id").match({ user_id: user.id, game_id: game.id }).maybeSingle(),
    supabase.from("favorites").select("game_id").match({ user_id: user.id, game_id: game.id }).maybeSingle(),
    game.has_scores ? supabase.rpc("game_leaderboard", { p_game_id: game.id }) : Promise.resolve({ data: [] }),
  ]);

  const isParent = profile.member_role === "parent";
  const shareable = game.status === "published" && game.share_enabled;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <nav className="mb-4 flex flex-wrap items-center gap-2 text-sm font-bold">
        <Link href="/" className="btn btn-white btn-sm">
          ← All games
        </Link>
        {game.status !== "published" && (
          <span className="chip border-berry bg-berry/10 text-berry">{STATUS_NOTE[game.status]}</span>
        )}
        <span className="ml-auto flex gap-2">
          {shareable && <ShareButton path={`/s/${game.share_token}`} title={game.title} />}
          {isParent && game.status === "pending" && (
            <Link href="/admin/approvals" className="btn btn-mint btn-sm">
              ✅ Review
            </Link>
          )}
          {isParent && (
            <Link href={`/admin/games/${game.id}`} className="btn btn-grape btn-sm">
              ✏️ Edit game
            </Link>
          )}
        </span>
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
