"use server";

import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/server";

export type WelcomeState = { error?: string } | null;

async function signedInWithoutFamily() {
  const viewer = await getViewer();
  if (!viewer?.profile) throw new Error("Please sign in again.");
  if (viewer.profile.family_id) throw new Error("You're already in a family.");
  return viewer;
}

export async function createFamily(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  try {
    const viewer = await signedInWithoutFamily();
    const familyName = String(form.get("family_name") ?? "").trim().slice(0, 60);
    const yourName = String(form.get("your_name") ?? "").trim().slice(0, 40);
    if (!familyName) return { error: "Give your family a name." };
    const admin = createAdminClient();
    const { data: family, error } = await admin
      .from("families")
      .insert({ name: familyName, created_by: viewer.user.id })
      .select("id")
      .single();
    if (error || !family) throw new Error(error?.message ?? "Couldn't create the family.");
    const { error: pErr } = await admin
      .from("profiles")
      .update({
        family_id: family.id,
        member_role: "parent",
        ...(yourName ? { display_name: yourName } : {}),
      })
      .eq("id", viewer.user.id)
      .is("family_id", null);
    if (pErr) {
      await admin.from("families").delete().eq("id", family.id);
      throw new Error(pErr.message);
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect("/admin/people?welcome=1");
}

export async function joinFamily(_prev: WelcomeState, form: FormData): Promise<WelcomeState> {
  try {
    const viewer = await signedInWithoutFamily();
    const code = String(form.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length < 6) return { error: "Invite codes are 10 letters and numbers." };
    const admin = createAdminClient();
    const { data: invite } = await admin
      .from("family_invites")
      .select("code, family_id, role, expires_at, used_by, families(status)")
      .eq("code", code)
      .maybeSingle();
    const famStatus = (invite?.families as unknown as { status: string } | null)?.status;
    if (!invite || invite.used_by || new Date(invite.expires_at).getTime() < Date.now() || famStatus !== "active") {
      return { error: "That invite code doesn't work. It may be used up or expired. Ask for a new one." };
    }
    // Claim the invite first so two people can't use the same code.
    const { data: claimed } = await admin
      .from("family_invites")
      .update({ used_by: viewer.user.id, used_at: new Date().toISOString() })
      .eq("code", code)
      .is("used_by", null)
      .select("code");
    if (!claimed?.length) return { error: "Someone just used that code. Ask for a new one." };
    const { error } = await admin
      .from("profiles")
      .update({ family_id: invite.family_id, member_role: invite.role })
      .eq("id", viewer.user.id)
      .is("family_id", null);
    if (error) throw new Error(error.message);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  redirect("/");
}
