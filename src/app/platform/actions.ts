"use server";

import { revalidatePath } from "next/cache";
import { assertPlatformAdmin } from "@/lib/auth";
import { deleteFamilyCompletely } from "@/lib/cleanup";
import { createAdminClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function setFamilyStatus(familyId: string, status: "active" | "suspended"): Promise<Result> {
  try {
    const { profile } = await assertPlatformAdmin();
    if (status !== "active" && status !== "suspended") throw new Error("Unknown status.");
    if (profile.family_id === familyId && status === "suspended") throw new Error("You can't pause your own family.");
    const { error } = await createAdminClient().from("families").update({ status }).eq("id", familyId);
    if (error) throw new Error(error.message);
    revalidatePath("/platform");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFamily(familyId: string): Promise<Result> {
  try {
    const { profile } = await assertPlatformAdmin();
    if (profile.family_id === familyId) throw new Error("You can't delete your own family from here.");
    await deleteFamilyCompletely(createAdminClient(), familyId);
    revalidatePath("/platform");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Deletes one person's account (e.g. after a report). Their family stays. */
export async function deleteUserAccount(userId: string): Promise<Result> {
  try {
    const { user } = await assertPlatformAdmin();
    if (userId === user.id) throw new Error("You can't delete yourself here.");
    const admin = createAdminClient();
    const { data: p } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    if (p?.username) await admin.from("kid_login_failures").delete().eq("username", p.username);
    revalidatePath("/platform");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
