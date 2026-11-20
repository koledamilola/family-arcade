"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { assertMember } from "@/lib/auth";
import { deleteFamilyCompletely } from "@/lib/cleanup";
import { createAdminClient, createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function updateMyProfile(fields: { display_name: string; avatar_emoji: string }): Promise<Result> {
  try {
    const { user, profile } = await assertMember();
    if (profile.member_role === "kid") throw new Error("Ask a parent to change this.");
    const display_name = fields.display_name.trim().slice(0, 40);
    if (!display_name) throw new Error("Name can't be empty.");
    const { error } = await createAdminClient()
      .from("profiles")
      .update({ display_name, avatar_emoji: fields.avatar_emoji.slice(0, 16) || "🙂" })
      .eq("id", user.id);
    if (error) throw new Error(error.message);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Deletes the signed-in grown-up's account. If they are the family's only parent,
 * the whole family goes with it (kids' accounts, games and files), because a
 * family can't be left without anyone in charge. They must type the family name
 * to confirm that.
 */
export async function deleteMyAccount(confirmText: string): Promise<Result> {
  try {
    const { user, profile, family } = await assertMember();
    if (profile.member_role === "kid") throw new Error("Ask a parent to remove your account.");
    const admin = createAdminClient();

    let wholeFamily = false;
    if (profile.member_role === "parent") {
      const { count } = await admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("family_id", family.id)
        .eq("member_role", "parent")
        .neq("id", user.id);
      wholeFamily = !count;
    }

    if (wholeFamily) {
      if (confirmText.trim().toLowerCase() !== family.name.trim().toLowerCase()) {
        throw new Error(`Type your family name ("${family.name}") to confirm.`);
      }
      await deleteFamilyCompletely(admin, family.id);
    } else {
      if (confirmText.trim().toUpperCase() !== "DELETE") throw new Error('Type DELETE to confirm.');
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw new Error(error.message);
    }
    await (await createClient()).auth.signOut().catch(() => {});
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  redirect("/login");
}
