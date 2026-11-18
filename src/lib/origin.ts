import "server-only";
import { headers } from "next/headers";

/** The site's own address, e.g. https://family-arcade.vercel.app */
export async function getOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Only allow redirects to paths on this site. */
export function safeNext(next: string | null | undefined) {
  if (!next || !next.startsWith("/")) return "/";
  // Browsers silently drop tabs/newlines and treat "\" like "/", so "/\t/evil.com"
  // or "/\\evil.com" would turn into "//evil.com". Refuse any control characters
  // or backslashes, then make sure the result really stays on this site.
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  try {
    const base = "http://same.invalid";
    const u = new URL(next, base);
    if (u.origin !== base) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
