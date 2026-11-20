import { Header } from "@/components/Header";
import { requireMember } from "@/lib/auth";

export default async function ArcadeLayout({ children }: LayoutProps<"/">) {
  const { profile, family } = await requireMember();
  return (
    <>
      <Header profile={profile} familyName={family.name} />
      <div className="flex-1">{children}</div>
      <footer className="mt-14">
        <div className="bulbs" aria-hidden />
        <p className="carpet py-6 text-center font-display font-semibold">Made with 💖 by {family.name}</p>
      </footer>
    </>
  );
}
