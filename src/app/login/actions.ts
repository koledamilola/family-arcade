"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getOrigin, safeNext } from "@/lib/origin";
import { PIN_RE, USERNAME_RE, kidEmail, kidPassword, normalizeUsername } from "@/lib/auth";

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
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: kidEmail(username),
    password: kidPassword(pin),
  });
  if (error) return { error: "Oops! Wrong username or PIN. Ask a grown-up if you forgot it." };
  redirect(safeNext(str(form, "next")));
}
