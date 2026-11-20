import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getViewer } from "@/lib/auth";
import { PKCE_COOKIE, saveConnection } from "@/lib/ai/connect";

// Step 2 of "Connect AI account": OpenRouter sends the parent back here with a
// one-time code. We swap it (plus our secret verifier) for the family's key.
export async function GET(request: NextRequest) {
  const back = (query: string) => {
    const res = NextResponse.redirect(new URL(`/admin/ai?${query}`, request.url));
    res.cookies.delete({ name: PKCE_COOKIE, path: "/admin/ai" });
    return res;
  };

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!code) return back("error=" + encodeURIComponent("Connecting was cancelled. Try again whenever you're ready."));

  const raw = (await cookies()).get(PKCE_COOKIE)?.value;
  let saved: { verifier: string; state: string; familyId: string } | null = null;
  try {
    saved = raw ? JSON.parse(raw) : null;
  } catch {}
  if (!saved || saved.state !== state) {
    return back("error=" + encodeURIComponent("That connection link expired. Please press Connect again."));
  }

  const viewer = await getViewer();
  if (!viewer?.profile || viewer.profile.member_role !== "parent" || viewer.family?.id !== saved.familyId) {
    return back("error=" + encodeURIComponent("Only a parent of this family can connect AI."));
  }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/auth/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: saved.verifier, code_challenge_method: "S256" }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(res.status === 403 ? "That sign-in code expired. Please press Connect again." : `OpenRouter had a problem (error ${res.status}).`);
    const { key } = (await res.json()) as { key?: string };
    if (!key) throw new Error("OpenRouter didn't send a key back. Please try again.");
    await saveConnection(saved.familyId, viewer.user.id, "openrouter", key);
  } catch (e) {
    return back("error=" + encodeURIComponent(e instanceof Error ? e.message : "Couldn't connect."));
  }
  return back("connected=1");
}
