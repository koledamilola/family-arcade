import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/origin";

// Google sign-in and email confirmation links land here.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(url.searchParams.get("next"));
  const supabase = await createClient();

  let error: string | null = url.searchParams.get("error_description");
  if (!error && code) {
    const res = await supabase.auth.exchangeCodeForSession(code);
    error = res.error?.message ?? null;
  } else if (!error && tokenHash && type) {
    const res = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    error = res.error?.message ?? null;
  } else if (!error) {
    error = "That sign-in link is missing information.";
  }

  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  }
  return NextResponse.redirect(new URL(next, request.url));
}
