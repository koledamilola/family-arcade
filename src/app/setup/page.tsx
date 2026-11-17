import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Logo } from "@/components/Logo";
import { isConfigured } from "@/lib/env";

export default async function SetupPage() {
  await connection();
  if (isConfigured()) redirect("/");
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Logo size="lg" />
      <div className="card mt-6 w-full max-w-xl p-7">
        <h1 className="text-3xl font-bold">🔧 One more step!</h1>
        <p className="mt-3">
          The arcade isn&apos;t connected to Supabase yet. Add these settings to a file called{" "}
          <code className="rounded bg-sunny/40 px-1.5 font-bold">.env.local</code> (on your computer) or to{" "}
          <strong>Vercel → Project → Settings → Environment Variables</strong>:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-2xl border-[3px] border-ink bg-ink p-4 text-sm text-sunny">
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...`}
        </pre>
        <p className="mt-4 text-ink/70">
          You can find them in Supabase under <strong>Project Settings → API Keys</strong>. See{" "}
          <strong>README.md</strong> for the full step-by-step guide.
        </p>
      </div>
    </main>
  );
}
