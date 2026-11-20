import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Game } from "@/lib/types";
import { GameForm } from "../game-form";

export const metadata: Metadata = { title: "Edit game" };

export default async function EditGamePage(props: PageProps<"/admin/games/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { family } = await requireParent();
  const supabase = await createClient();
  const { data: game } = await supabase.from("games").select("*").eq("id", id).eq("family_id", family.id).maybeSingle<Game>();
  if (!game) notFound();

  return (
    <div>
      <h2 className="mb-4 text-2xl font-bold">✏️ Edit “{game.title}”</h2>
      <GameForm game={game} />
    </div>
  );
}
