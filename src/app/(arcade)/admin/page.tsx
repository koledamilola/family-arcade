import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { GamesTable } from "./games-table";

export const metadata: Metadata = { title: "Admin" };

export default async function AdminGamesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("game_cards").select("*").order("created_at", { ascending: false });
  const games = (data as GameCard[] | null) ?? [];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto text-2xl font-bold">
          Games <span className="text-ink/50">({games.length})</span>
        </h2>
        <Link href="/admin/games/new" className="btn btn-mint">
          ➕ Add a game
        </Link>
      </div>
      <GamesTable games={games} />
    </div>
  );
}
