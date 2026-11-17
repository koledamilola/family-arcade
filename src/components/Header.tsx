import Link from "next/link";
import { Logo } from "@/components/Logo";
import { Avatar } from "@/components/Avatar";
import type { Profile } from "@/lib/types";

export function Header({ profile }: { profile: Profile }) {
  return (
    <header className="sticky top-0 z-30 border-b-[3px] border-ink bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <Link href="/" className="mr-auto" aria-label="Home">
          <Logo />
        </Link>
        {profile.role === "admin" && (
          <Link href="/admin" className="btn btn-grape btn-sm">
            <span aria-hidden>🛠️</span>
            <span className="hidden sm:inline">Admin</span>
          </Link>
        )}
        <details className="relative">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full border-2 border-ink bg-white py-1 pr-3 pl-1 font-display font-semibold shadow-pop-sm [&::-webkit-details-marker]:hidden">
            <Avatar url={profile.avatar_url} emoji={profile.avatar_emoji} name={profile.display_name} size={30} />
            <span className="max-w-28 truncate">{profile.display_name}</span>
          </summary>
          <div className="card absolute right-0 mt-2 w-56 p-2">
            <p className="px-3 py-2 text-sm text-ink/60">
              Signed in as <strong className="text-ink">{profile.display_name}</strong>
              {profile.role === "admin" && <span className="ml-1 rounded-full bg-grape px-2 text-xs text-white">admin</span>}
            </p>
            <Link href="/?view=favorites" className="block rounded-xl px-3 py-2 font-semibold hover:bg-cream">
              ⭐ My favorites
            </Link>
            <form action="/auth/signout" method="post">
              <button className="w-full rounded-xl px-3 py-2 text-left font-semibold text-berry hover:bg-cream">
                👋 Sign out
              </button>
            </form>
          </div>
        </details>
      </div>
    </header>
  );
}
