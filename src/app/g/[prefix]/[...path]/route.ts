import { NextResponse } from "next/server";
import { SUPABASE_URL, isConfigured } from "@/lib/env";
import { GAME_SANDBOX, injectShim } from "@/lib/game-shim";
import { isHtml, mimeFor } from "@/lib/mime";

// Serves uploaded game files from /g/<upload-folder>/<file path>.
//  - HTML pages are fetched and served here with the save/score helper injected,
//    inside a strict sandbox (CSP) so the game can't touch anyone's sign-in.
//  - Everything else (images, sounds, scripts, wasm) is redirected straight to
//    Supabase Storage, so big files never pass through Vercel.

const PREFIX_RE = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, ctx: RouteContext<"/g/[prefix]/[...path]">) {
  if (!isConfigured()) return new NextResponse("Not configured", { status: 503 });
  const { prefix, path } = await ctx.params;
  const parts = path.map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  if (!PREFIX_RE.test(prefix) || parts.some((p) => p === ".." || p === "." || p === "" || p.includes("\\"))) {
    return new NextResponse("Not found", { status: 404 });
  }
  const filePath = parts.map(encodeURIComponent).join("/");
  const storageUrl = `${SUPABASE_URL}/storage/v1/object/public/games/${prefix}/${filePath}`;

  const common = {
    "Access-Control-Allow-Origin": "*",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };

  if (!isHtml(parts[parts.length - 1])) {
    return NextResponse.redirect(storageUrl, {
      status: 307,
      headers: { ...common, "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  const res = await fetch(storageUrl, { cache: "no-store" });
  if (!res.ok) return new NextResponse("Game file not found", { status: 404, headers: common });
  const html = injectShim(await res.text());

  return new NextResponse(html, {
    headers: {
      ...common,
      "Content-Type": mimeFor(parts[parts.length - 1]),
      "Content-Security-Policy": `sandbox ${GAME_SANDBOX}`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "public, max-age=300, s-maxage=31536000",
    },
  });
}
