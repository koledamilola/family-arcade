"use client";

import { useActionState, useState } from "react";
import { type WelcomeState, createFamily, joinFamily } from "./actions";

export function WelcomeForms({ name, initialCode }: { name: string; initialCode: string }) {
  const [mode, setMode] = useState<"create" | "join">(initialCode ? "join" : "create");
  const [createState, createAction, creating] = useActionState<WelcomeState, FormData>(createFamily, null);
  const [joinState, joinAction, joining] = useActionState<WelcomeState, FormData>(joinFamily, null);

  return (
    <div className="card mt-7 w-full max-w-md p-6 text-ink sm:p-7 [--ledge:#07051a]">
      <h1 className="text-center text-3xl">Welcome{name ? `, ${name}` : ""}! 👋</h1>
      <p className="mt-2 text-center text-ink/70">Every arcade belongs to a family. Start yours, or join one.</p>

      <div className="mt-5 mb-5 grid grid-cols-2 gap-1.5 rounded-xl border-2 border-ink bg-cream p-1">
        <button
          type="button"
          onClick={() => setMode("create")}
          aria-pressed={mode === "create"}
          className={`rounded-lg px-3 py-2 font-display font-semibold transition ${mode === "create" ? "bg-mint text-white" : "text-ink/70 hover:bg-white"}`}
        >
          🏠 Start a family
        </button>
        <button
          type="button"
          onClick={() => setMode("join")}
          aria-pressed={mode === "join"}
          className={`rounded-lg px-3 py-2 font-display font-semibold transition ${mode === "join" ? "bg-ocean text-white" : "text-ink/70 hover:bg-white"}`}
        >
          🎟️ I have a code
        </button>
      </div>

      {mode === "create" ? (
        <form action={createAction} className="space-y-4">
          {createState?.error && <Alert>{createState.error}</Alert>}
          <label className="block">
            <span className="label">Family name</span>
            <input name="family_name" className="input text-lg" maxLength={60} required placeholder="The Smith Family" />
          </label>
          <label className="block">
            <span className="label">Your name (what the kids see)</span>
            <input name="your_name" className="input" maxLength={40} defaultValue={name} placeholder="Mum, Dad, Alex…" />
          </label>
          <p className="rounded-xl bg-cream p-3 text-sm text-ink/75">
            You&apos;ll be the family&apos;s <strong>parent</strong>: you add the kids, approve the games they make and
            connect the AI that helps build them.
          </p>
          <button className="btn btn-mint w-full py-3 text-lg" disabled={creating}>
            {creating ? "Creating…" : "Create our family arcade"}
          </button>
        </form>
      ) : (
        <form action={joinAction} className="space-y-4">
          {joinState?.error && <Alert>{joinState.error}</Alert>}
          <label className="block">
            <span className="label">Invite code from a parent</span>
            <input
              name="code"
              className="input text-center font-marquee text-2xl tracking-[0.2em] uppercase"
              defaultValue={initialCode}
              maxLength={14}
              autoCapitalize="characters"
              spellCheck={false}
              required
              placeholder="ABCD234XYZ"
            />
          </label>
          <button className="btn btn-ocean w-full py-3 text-lg" disabled={joining}>
            {joining ? "Joining…" : "Join the family"}
          </button>
          <p className="text-center text-sm text-ink/60">
            Kids don&apos;t need a code: a parent makes their account, then they use <strong>Kid login</strong>.
          </p>
        </form>
      )}

      <form action="/auth/signout" method="post" className="mt-5 text-center">
        <button className="text-sm font-semibold text-ink/50 underline hover:text-ink">Sign out</button>
      </form>
    </div>
  );
}

function Alert({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border-2 border-berry bg-berry/10 px-4 py-3 text-sm font-semibold text-berry">
      {children}
    </p>
  );
}
