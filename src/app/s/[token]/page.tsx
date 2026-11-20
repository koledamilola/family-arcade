import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/env";
import type { GameCard } from "@/lib/types";
import { Player } from "@/app/(arcade)/play/[slug]/player";

// Public page: anyone with a game's share link can play it, no account needed.
// Only published games with sharing switched on, from active families, show up.

const TOKEN_RE = /^[0-9a-f]{32}$/;

const getSharedGame = cache(async (token: string) => {
  if (!TOKEN_RE.test(token) || !isConfigured()) return null;
  const { data } = await createAdminClient()
    .from("games")
    .select("*, families!inner(name, status)")
    .eq("share_token", token)
    .eq("share_enabled", true)
    .eq("status", "published")
    .eq("families.status", "active")
    .maybeSingle();
  if (!data) return null;
  const { families, ...game } = data as GameCard & { families: { name: string } };
  return { game: { ...game, like_count: 0 } as GameCard, familyName: families.name };
});

export async function generateMetadata(props: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await props.params;
  const shared = await getSharedGame(token);
  if (!shared) return { title: "Game not found", robots: { index: false } };
  return {
    title: shared.game.title,
    description: shared.game.description || `A game made by ${shared.game.creator_name || shared.familyName}.`,
    robots: { index: false, follow: false },
  };
}

export default async function SharedGamePage(props: PageProps<"/s/[token]">) {
  const { token } = await props.params;
  const shared = await getSharedGame(token);
  if (!shared) notFound();

  return (
    <>
      <header className="border-b-[3px] border-sunny bg-ink text-white">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
          <Link href="/login" className="mr-auto rounded-full" aria-label="Family Arcade">
            <Logo />
          </Link>
          <span className="hidden font-display text-sm text-white/70 sm:inline">Shared by {shared.familyName}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Player game={shared.game} userId="guest" initialLiked={false} initialFavorite={false} initialBoard={[]} guest />
      </main>
    </>
  );
}
