import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/types";

const ROLE_LABEL = { parent: "parent", adult: "grown-up", kid: "kid" } as const;

export function Header({ profile, familyName }: { profile: Profile; familyName?: string | null }) {
  const isParent = profile.member_role === "parent";
  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-sunny bg-ink text-white [--ledge:#07051a]">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-3 sm:gap-3">
        <Link href="/" className="mr-auto min-w-0 rounded-full" aria-label="Home">
          <Logo />
        </Link>
        {profile.is_platform_admin && (
          <Link href="/platform" className="btn btn-white btn-sm border-white/20">
            <span aria-hidden>🌐</span>
            <span className="hidden sm:inline">Platform</span>
          </Link>
        )}
        {isParent && (
          <Link href="/admin" className="btn btn-grape btn-sm border-white/20">
            <span aria-hidden>🏠</span>
            <span className="hidden sm:inline">Family</span>
          </Link>
        )}
        <details className="relative">
          <summary aria-label="Account menu" className="flex cursor-pointer list-none items-center gap-2 rounded-full border-2 border-white/25 bg-white/10 p-1 sm:pr-3 font-display font-semibold transition hover:bg-white/20 [&::-webkit-details-marker]:hidden">
            <Avatar url={profile.avatar_url} emoji={profile.avatar_emoji} name={profile.display_name} size={30} />
            <span className="hidden max-w-28 truncate sm:inline">{profile.display_name}</span>
          </summary>
          <div className="card absolute right-0 mt-2 w-60 p-2 text-ink [--ledge:var(--color-ink)]">
            <p className="px-3 py-2 text-sm text-ink/60">
              Signed in as <strong className="text-ink">{profile.display_name}</strong>
              {profile.member_role && (
                <span className="ml-1 rounded-full bg-grape px-2 text-xs text-white">{ROLE_LABEL[profile.member_role]}</span>
              )}
              {familyName && <span className="mt-0.5 block truncate">{familyName}</span>}
            </p>
            {profile.family_id && (
              <Link href="/?view=favorites" className="block rounded-lg px-3 py-2 font-semibold hover:bg-cream">
                ⭐ My favorites
              </Link>
            )}
            {profile.member_role !== "kid" && (
              <Link href="/account" className="block rounded-lg px-3 py-2 font-semibold hover:bg-cream">
                ⚙️ My account
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button className="w-full rounded-lg px-3 py-2 text-left font-semibold text-berry hover:bg-cream">
                👋 Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
