import type { Metadata } from "next";
import { requireParent } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { GameCard } from "@/lib/types";
import { ApprovalQueue } from "./approval-queue";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage() {
  const { family } = await requireParent();
  const supabase = await createClient();
  const [{ data: pending }, { data: people }] = await Promise.all([
    supabase
      .from("game_cards")
      .select("*")
      .eq("family_id", family.id)
      .eq("status", "pending")
      .order("updated_at", { ascending: true }),
    supabase.from("profiles").select("id, display_name, avatar_emoji").eq("family_id", family.id),
  ]);
  const names = Object.fromEntries((people ?? []).map((p) => [p.id, `${p.avatar_emoji} ${p.display_name}`]));

  return (
    <div>
      <h2 className="text-2xl font-bold">Waiting for your OK</h2>
      <p className="mt-1 mb-5 max-w-2xl text-ink/70">
        When a kid finishes a game in the Studio and asks to publish it, it lands here. Play it first, then approve it
        for the family arcade or send it back with a note saying what to change.
      </p>
      <ApprovalQueue
        games={((pending as GameCard[] | null) ?? []).map((g) => ({
          ...g,
          maker: (g.created_by && names[g.created_by]) || g.creator_name || "Someone",
        }))}
      />
    </div>
  );
}
