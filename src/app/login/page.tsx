import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { getViewer } from "@/lib/auth";
import { LoginForms } from "./login-forms";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  const error = typeof params.error === "string" ? params.error : undefined;

  const viewer = await getViewer();
  if (viewer) redirect(viewer.profile?.role === "pending" ? "/pending" : "/");

  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-4 py-10">
      <Decorations />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Logo size="lg" />
          <p className="font-display text-lg text-ink/70">Games made by our family, for our family!</p>
        </div>
        <div className="card animate-pop-in p-5 sm:p-7">
          <LoginForms next={next} initialError={error} />
        </div>
      </div>
    </main>
  );
}

function Decorations() {
  const items = [
    { e: "👾", c: "left-[6%] top-[12%] text-5xl" },
    { e: "🚀", c: "right-[8%] top-[18%] text-6xl" },
    { e: "⭐", c: "left-[12%] bottom-[14%] text-5xl" },
    { e: "🎯", c: "right-[10%] bottom-[10%] text-5xl" },
    { e: "🥊", c: "left-[40%] top-[4%] text-4xl hidden sm:block" },
  ];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 hidden sm:block">
      {items.map((it, i) => (
        <span
          key={i}
          className={`animate-float absolute opacity-80 ${it.c}`}
          style={{ animationDelay: `${i * 0.6}s` }}
        >
          {it.e}
        </span>
      ))}
    </div>
  );
}
