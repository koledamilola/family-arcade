import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";

export const metadata: Metadata = { title: "Waiting for approval" };

export default async function PendingPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile && viewer.profile.role !== "pending") redirect("/");

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Logo />
      <div className="card animate-pop-in mt-6 w-full max-w-md p-7 text-center">
        <div className="animate-float mb-3 text-6xl" aria-hidden>
          ⏳
        </div>
        <h1 className="text-3xl font-bold">Almost in!</h1>
        <p className="mt-3 text-lg text-ink/80">
          Hi <strong>{viewer.profile?.display_name ?? "there"}</strong>! A family admin needs to approve your account
          before you can play.
        </p>
        <p className="mt-2 text-ink/60">Give them a nudge, then come back and press the button below.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/pending" className="btn btn-sunny" prefetch={false}>
            🔄 Check again
          </Link>
          <form action="/auth/signout" method="post">
            <button className="btn btn-white w-full">Sign out</button>
          </form>
        </div>
      </div>
    </main>
  );
}
