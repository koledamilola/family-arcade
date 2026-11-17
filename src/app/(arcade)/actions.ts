"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { LeaderboardRow } from "@/lib/types";

async function me() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Please sign in again.");
  return { supabase, userId: data.user.id };
}

export async function setLiked(gameId: string, liked: boolean) {
  const { supabase, userId } = await me();
  const res = liked
    ? await supabase.from("likes").upsert({ user_id: userId, game_id: gameId }, { ignoreDuplicates: true })
    : await supabase.from("likes").delete().match({ user_id: userId, game_id: gameId });
  if (res.error) throw new Error(res.error.message);
  revalidatePath("/");
}

export async function setFavorite(gameId: string, favorite: boolean) {
  const { supabase, userId } = await me();
  const res = favorite
    ? await supabase.from("favorites").upsert({ user_id: userId, game_id: gameId }, { ignoreDuplicates: true })
    : await supabase.from("favorites").delete().match({ user_id: userId, game_id: gameId });
  if (res.error) throw new Error(res.error.message);
  revalidatePath("/");
}

export async function recordPlay(gameId: string) {
  const supabase = await createClient();
  await supabase.rpc("record_play", { p_game_id: gameId });
}

export async function submitScore(gameId: string, score: number): Promise<LeaderboardRow[]> {
  if (!Number.isFinite(score) || Math.abs(score) > 1e12) throw new Error("That score looks broken.");
  const { supabase, userId } = await me();
  const { data: game } = await supabase.from("games").select("has_scores").eq("id", gameId).maybeSingle();
  if (!game?.has_scores) return getLeaderboard(gameId);
  const { error } = await supabase.from("scores").insert({ game_id: gameId, user_id: userId, score });
  if (error) throw new Error(error.message);
  return getLeaderboard(gameId);
}

export async function getLeaderboard(gameId: string): Promise<LeaderboardRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("game_leaderboard", { p_game_id: gameId });
  return (data as LeaderboardRow[] | null) ?? [];
}
