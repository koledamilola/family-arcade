"use server";

import { redirect } from "next/navigation";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { getOrigin, safeNext } from "@/lib/origin";
import { PIN_RE, USERNAME_RE, kidEmail, kidPassword, legacyKidPassword, normalizeUsername } from "@/lib/auth";

export type FormState = { error?: string; message?: string } | null;

function str(form: FormData, key: string) {
  return String(form.get(key) ?? "").trim();
}

export async function signInWithGoogle(form: FormData) {
  const supabase = await createClient();
  const origin = await getOrigin();
  const next = safeNext(str(form, "next"));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=${encodeURIComponent(error?.message ?? "Google sign-in failed")}`);
  redirect(data.url);
}

export async function signInWithEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Please enter your email and password." };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Please confirm your email first. Check your inbox for the link." };
    }
    return { error: "That email and password don't match. Try again?" };
  }
  redirect(safeNext(str(form, "next")));
}

export async function signUpWithEmail(_prev: FormState, form: FormData): Promise<FormState> {
  const name = str(form, "name");
  const email = str(form, "email");
  const password = String(form.get("password") ?? "");
  if (!name || !email || !password) return { error: "Please fill in every box." };
  if (password.length < 8) return { error: "Pick a password with at least 8 characters." };
  const supabase = await createClient();
  const origin = await getOrigin();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: name.slice(0, 40) },
      emailRedirectTo: `${origin}/auth/callback`,
    },
  });
  if (error) return { error: error.message };
  if (data.session) redirect("/pending");
  return {
    message: "Almost there! Check your email for a confirmation link. After that, a grown-up admin needs to approve you.",
  };
}

export async function signInKid(_prev: FormState, form: FormData): Promise<FormState> {
  const username = normalizeUsername(str(form, "username"));
  const pin = str(form, "pin");
  if (!USERNAME_RE.test(username) || !PIN_RE.test(pin)) {
    return { error: "Hmm, that username or PIN doesn't look right." };
  }
  const wait = await kidLockMinutes(username);
  if (wait > 0) {
    return { error: `Too many wrong tries! Wait ${wait} minute${wait === 1 ? "" : "s"} or ask a grown-up to help.` };
  }

  const supabase = await createClient();
  const email = kidEmail(username);
  let { error } = await supabase.auth.signInWithPassword({ email, password: kidPassword(pin) });

  if (error) {
    // Accounts made before the PIN upgrade still have the old password format.
    // If the old one works, switch the account over to the new, safer one.
    const legacy = await supabase.auth.signInWithPassword({ email, password: legacyKidPassword(pin) });
    error = legacy.error;
    if (!error && legacy.data.user) {
      await createAdminClient()
        .auth.admin.updateUserById(legacy.data.user.id, { password: kidPassword(pin) })
        .catch(() => {});
    }
  }

  if (error) {
    await recordKidFailure(username);
    return { error: "Oops! Wrong username or PIN. Ask a grown-up if you forgot it." };
  }
  await clearKidFailures(username);
  redirect(safeNext(str(form, "next")));
}

// ---- Wrong-PIN lockout (a 4-digit PIN is only 10,000 guesses) ----------------
// After 5 wrong tries the username is locked for 15 minutes, doubling with each
// further wrong try (up to a day). An admin resetting the PIN clears it.

const FREE_TRIES = 5;

async function kidLockMinutes(username: string) {
  const { data, error } = await createAdminClient()
    .from("kid_login_failures")
    .select("locked_until")
    .eq("username", username)
    .maybeSingle();
  if (error) {
    console.warn("Kid login lockout table is missing. Re-run supabase/schema.sql.", error.message);
    return 0;
  }
  const until = data?.locked_until ? new Date(data.locked_until).getTime() : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60_000) : 0;
}

async function recordKidFailure(username: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("kid_login_failures").select("failures").eq("username", username).maybeSingle();
  const failures = (data?.failures ?? 0) + 1;
  const lockMinutes = failures >= FREE_TRIES ? Math.min(15 * 2 ** (failures - FREE_TRIES), 24 * 60) : 0;
  await admin.from("kid_login_failures").upsert({
    username,
    failures,
    locked_until: lockMinutes ? new Date(Date.now() + lockMinutes * 60_000).toISOString() : null,
  });
}

// Not exported: everything exported from a "use server" file can be called by anyone.
async function clearKidFailures(username: string) {
  await createAdminClient().from("kid_login_failures").delete().eq("username", username);
}
