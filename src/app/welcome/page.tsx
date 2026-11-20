import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";
import { WelcomeForms } from "./welcome-forms";

export const metadata: Metadata = { title: "Welcome" };

export default async function WelcomePage(props: PageProps<"/welcome">) {
  const params = await props.searchParams;
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (viewer.profile?.family_id && viewer.family) redirect("/");

  const paused = Boolean(viewer.profile?.family_id && !viewer.family);
  const code = typeof params.code === "string" ? params.code : "";

  return (
    <main className="carpet flex flex-1 flex-col items-center justify-center px-4 py-10">
      <Logo />
      {paused ? (
        <div className="card mt-7 w-full max-w-md p-7 text-center text-ink">
          <div className="mb-3 text-6xl" aria-hidden>⏸️</div>
          <h1 className="text-3xl">This family is paused</h1>
          <p className="mt-3 text-lg text-ink/80">
            Your family&apos;s arcade has been paused. If you&apos;re a parent, contact support to sort it out.
          </p>
          <form action="/auth/signout" method="post" className="mt-6">
            <button className="btn btn-white">Sign out</button>
          </form>
        </div>
      ) : (
        <WelcomeForms name={viewer.profile?.display_name ?? ""} initialCode={code} />
      )}
    </main>
  );
}
