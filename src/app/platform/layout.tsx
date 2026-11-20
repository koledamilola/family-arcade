import { Header } from "@/components/Header";
import { requirePlatformAdmin } from "@/lib/auth";

export default async function PlatformLayout({ children }: LayoutProps<"/platform">) {
  const { profile, family } = await requirePlatformAdmin();
  if (!profile) return null;
  return (
    <>
      <Header profile={profile} familyName={family?.name} />
      <div className="flex-1">{children}</div>
    </>
  );
}
