import { Header } from "@/components/Header";
import { requirePlayer } from "@/lib/auth";
import { SITE_NAME } from "@/lib/env";

export default async function ArcadeLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requirePlayer();
  return (
    <>
      <Header profile={profile} />
      <div className="flex-1">{children}</div>
      <footer className="mt-14">
        <div className="bulbs" aria-hidden />
        <p className="carpet py-6 text-center font-display font-semibold">
          Made with 💖 by the {SITE_NAME} crew
        </p>
      </footer>
    </>
  );
}
