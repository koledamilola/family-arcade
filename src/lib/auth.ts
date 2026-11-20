import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSecretKey } from "@/lib/env";
import type { Family, MemberRole, Profile } from "@/lib/types";

/** The signed-in visitor, their profile and their family (null if signed out). */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle<Profile>();
  let family: Family | null = null;
  if (profile?.family_id) {
    // Only returns the family while it is active (see my_family_id() in schema.sql).
    const { data: fam } = await supabase.from("families").select("*").eq("id", profile.family_id).maybeSingle<Family>();
    family = fam && fam.status === "active" ? fam : null;
  }
  return { user, profile, family };
});

export type Member = {
  user: User;
  profile: Profile & { family_id: string; member_role: MemberRole };
  family: Family;
};

function asMember(v: Awaited<ReturnType<typeof getViewer>>): Member | null {
  if (!v?.profile?.family_id || !v.profile.member_role || !v.family) return null;
  return v as Member;
}

/** For pages that need someone in an active family. Others go to login / welcome. */
export async function requireMember(): Promise<Member> {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  const member = asMember(viewer);
  if (!member) redirect("/welcome");
  return member;
}

export async function requireParent(): Promise<Member> {
  const member = await requireMember();
  if (member.profile.member_role !== "parent") redirect("/");
  return member;
}

export async function requirePlatformAdmin() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile?.is_platform_admin) redirect("/");
  return { user: viewer.user, profile: viewer.profile, family: viewer.family };
}

/** For server actions: throw instead of redirecting. */
export async function assertMember(): Promise<Member> {
  const member = asMember(await getViewer());
  if (!member) throw new Error("Please sign in again.");
  return member;
}

export async function assertParent(): Promise<Member> {
  const member = await assertMember();
  if (member.profile.member_role !== "parent") throw new Error("Only parents can do that.");
  return member;
}

export async function assertPlatformAdmin() {
  const viewer = await getViewer();
  if (!viewer?.profile?.is_platform_admin) throw new Error("Only the platform admin can do that.");
  return { user: viewer.user, profile: viewer.profile };
}

// Kid accounts are normal Supabase accounts with a made-up email address
// (the ".invalid" domain is reserved, so no email is ever sent anywhere).
export const KID_EMAIL_DOMAIN = "kids.family-arcade.invalid";

export function kidEmail(username: string) {
  return `${username.toLowerCase()}@${KID_EMAIL_DOMAIN}`;
}

/**
 * The Supabase password for a kid's PIN. It is mixed with a server-only secret,
 * so knowing (or guessing) a 4-digit PIN is useless against Supabase directly:
 * the only way to try a PIN is through this site's login, which is rate limited.
 *
 * Uses KID_PIN_SECRET if set, otherwise the Supabase secret key. If that secret
 * ever changes, kids need their PIN reset by a parent.
 */
export function kidPassword(pin: string) {
  const secret = process.env.KID_PIN_SECRET || getSecretKey();
  return "fa-kid-v2-" + createHmac("sha256", secret).update(`family-arcade-kid-pin:${pin}`).digest("base64url");
}

/** The old, guessable password format. Only used to upgrade existing kid accounts. */
export function legacyKidPassword(pin: string) {
  return `fa-kid-pin-${pin}`;
}

export function normalizeUsername(raw: string) {
  return raw.trim().toLowerCase();
}

export const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
export const PIN_RE = /^\d{4,8}$/;
