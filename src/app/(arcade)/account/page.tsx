import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";
import { AccountForms } from "./account-forms";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const { user, profile, family } = await requireMember();
  if (profile.member_role === "kid") redirect("/");

  let soleParent = false;
  if (profile.member_role === "parent") {
    const { count } = await createAdminClient()
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("family_id", family.id)
      .eq("member_role", "parent")
      .neq("id", user.id);
    soleParent = !count;
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold sm:text-4xl">⚙️ My account</h1>
      <AccountForms
        name={profile.display_name}
        emoji={profile.avatar_emoji}
        email={profile.email ?? user.email ?? ""}
        familyName={family.name}
        soleParent={soleParent}
      />
    </main>
  );
}
