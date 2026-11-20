import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { requirePlatformAdmin } from "@/lib/auth";
import { isConfigured } from "@/lib/env";

// Diagnostic page: shows which Supabase settings this deployment can see,
// with keys masked (never the full key), and whether Supabase accepts them.

type Check = { name: string; value: string | undefined };

function mask(v: string) {
  if (v.length <= 20) return `${v.slice(0, 4)}… (${v.length} characters)`;
  return `${v.slice(0, 15)}…${v.slice(-4)} (${v.length} characters)`;
}

function problems(v: string | undefined) {
  if (v === undefined) return ["Not set"];
  const out: string[] = [];
  if (v === "") out.push("Empty");
  if (v !== v.trim()) out.push("Has spaces or a line break at the start or end");
  if (/^["']|["']$/.test(v)) out.push("Has quote marks around it");
  if (/x{6,}/i.test(v)) out.push("Looks like the placeholder from .env.example");
  return out;
}

async function probe(url: string, key: string, path: string) {
  try {
    const res = await fetch(`${url.trim().replace(/\/$/, "")}${path}`, {
      headers: { apikey: key.trim() },
      cache: "no-store",
    });
    if (res.ok) return { ok: true, text: `Accepted ✅ (HTTP ${res.status})` };
    const body = (await res.text()).slice(0, 160);
    return { ok: false, text: `Rejected ❌ (HTTP ${res.status}) ${body}` };
  } catch (e) {
    return { ok: false, text: `Could not reach Supabase ❌ ${e instanceof Error ? e.message : ""}` };
  }
}

export default async function CheckPage() {
  await connection();
  // Once the site works, only admins may see this (it shows parts of the keys).
  // While it's not set up yet there's no login, so it stays open to help fix it.
  if (isConfigured()) await requirePlatformAdmin();
  // Written out in full on purpose so values match exactly what the rest of the site uses.
  const vars: Check[] = [
    { name: "NEXT_PUBLIC_SUPABASE_URL", value: process.env.NEXT_PUBLIC_SUPABASE_URL },
    { name: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", value: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    { name: "SUPABASE_SECRET_KEY", value: process.env.SUPABASE_SECRET_KEY },
    { name: "NEXT_PUBLIC_SUPABASE_ANON_KEY (old name, should be unset)", value: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY },
    { name: "SUPABASE_SERVICE_ROLE_KEY (old name, should be unset)", value: process.env.SUPABASE_SERVICE_ROLE_KEY },
  ];

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Same order the site itself uses.
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

  const publicTest = url && publicKey ? await probe(url, publicKey, "/auth/v1/settings") : null;
  const secretTest = url && secretKey ? await probe(url, secretKey, "/rest/v1/profiles?select=id&limit=1") : null;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
      <Logo />
      <div className="card mt-6 p-6">
        <h1 className="text-3xl font-bold">🔍 Settings check</h1>
        <p className="mt-2 text-ink/70">
          What this deployment can see. Keys are shortened. Compare the first and last characters with{" "}
          <code>.env.local</code> on your computer.
        </p>

        <ul className="mt-5 space-y-3">
          {vars.map((v) => {
            const issues = problems(v.value);
            const isUrl = v.name === "NEXT_PUBLIC_SUPABASE_URL";
            const unsetOk = v.name.includes("should be unset") && v.value === undefined;
            return (
              <li key={v.name} className="rounded-2xl border-2 border-ink/20 p-3">
                <p className="font-mono text-sm font-bold break-all">{v.name}</p>
                <p className="mt-1 font-mono text-sm break-all">
                  {v.value === undefined ? "—" : isUrl ? JSON.stringify(v.value) : mask(v.value)}
                </p>
                {!unsetOk && issues.length > 0 && (
                  <p className="mt-1 text-sm font-semibold text-berry">⚠️ {issues.join(" · ")}</p>
                )}
                {v.name.includes("should be unset") && v.value !== undefined && (
                  <p className="mt-1 text-sm font-semibold text-berry">⚠️ Set. Delete this one in Vercel.</p>
                )}
              </li>
            );
          })}
        </ul>

        <h2 className="mt-6 text-xl font-bold">Does Supabase accept them?</h2>
        <ul className="mt-2 space-y-2 text-sm">
          <li>
            <strong>Publishable key</strong> (used for sign-in and sign-up):{" "}
            <span className={publicTest?.ok ? "text-mint" : "text-berry"}>{publicTest?.text ?? "Not tested (missing)"}</span>
          </li>
          <li>
            <strong>Secret key</strong> (used by admin tools):{" "}
            <span className={secretTest?.ok ? "text-mint" : "text-berry"}>{secretTest?.text ?? "Not tested (missing)"}</span>
          </li>
        </ul>
        <p className="mt-4 text-xs text-ink/50">
          Vercel environment: {process.env.VERCEL_ENV ?? "local"} · deployment: {(process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "n/a"}
        </p>
      </div>
    </main>
  );
}
