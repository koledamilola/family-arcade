import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createHmac } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getSecretKey } from "@/lib/env";
import type { Profile } from "@/lib/types";

/** The signed-in visitor and their profile (null if signed out). */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return { user, profile };
});

/** For pages that need an approved player. Sends others to login / waiting room. */
export async function requirePlayer() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!viewer.profile || viewer.profile.role === "pending") redirect("/pending");
  return { user: viewer.user, profile: viewer.profile };
}

export async function requireAdmin() {
  const viewer = await requirePlayer();
  if (viewer.profile.role !== "admin") redirect("/");
  return viewer;
}

/** For server actions: throws instead of redirecting. */
export async function assertAdmin() {
  const viewer = await getViewer();
  if (!viewer?.profile || viewer.profile.role !== "admin") {
    throw new Error("Only admins can do that.");
  }
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
 * ever changes, kids need their PIN reset by an admin.
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
