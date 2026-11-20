import type { Metadata } from "next";
import Link from "next/link";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { GamesTable } from "./games-table";

export const metadata: Metadata = { title: "Family games" };

export default async function AdminGamesPage() {
  const { family } = await requireParent();
  const supabase = await createClient();
  const { data } = await supabase
    .from("game_cards")
    .select("*")
    .eq("family_id", family.id)
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  const games = (data as GameCard[] | null) ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-2xl font-bold">
          Games <span className="text-ink/50">({games.length})</span>
        </h2>
        <Link href="/admin/games/new" className="btn btn-mint">
          ➕ Upload a game
        </Link>
      </div>
      <GamesTable games={games} />
    </div>
  );
}
