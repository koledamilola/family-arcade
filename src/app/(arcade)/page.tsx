import { requireMember } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { HomeClient } from "./home-client";

export default async function HomePage(props: PageProps<"/">) {
  const params = await props.searchParams;
  const { profile, user, family } = await requireMember();
  const supabase = await createClient();

  const [games, likes, favorites] = await Promise.all([
    supabase
      .from("game_cards")
      .select("*")
      .eq("family_id", family.id)
      .eq("status", "published")
      .order("created_at", { ascending: false }),
    supabase.from("likes").select("game_id").eq("user_id", user.id),
    supabase.from("favorites").select("game_id").eq("user_id", user.id),
  ]);

  return (
    <HomeClient
      key={params.view === "favorites" ? "favorites" : "all"}
      name={profile.display_name}
      isParent={profile.member_role === "parent"}
      games={(games.data as GameCard[] | null) ?? []}
      likedIds={(likes.data ?? []).map((l) => l.game_id as string)}
      favoriteIds={(favorites.data ?? []).map((f) => f.game_id as string)}
      initialView={params.view === "favorites" ? "favorites" : "all"}
    />
  );
}
