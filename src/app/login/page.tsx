import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/origin";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : undefined;

  const viewer = await getViewer();
  if (viewer) redirect(viewer.family ? safeNext(next) : "/welcome");

  return (
    <main className="carpet flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <p className="font-hand text-2xl text-white/85">Make games together. Play them as a family.</p>
        </div>
        <div className="card p-5 text-ink sm:p-7 [--ledge:#07051a]">
          <LoginForms next={next} initialError={error} />
        </div>
      </div>
    </main>
  );
}
