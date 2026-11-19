"use client";

import { useActionState, useState } from "react";
import {
  type FormState,
  signInKid,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
} from "./actions";

type Tab = "kids" | "grownups";

export function LoginForms({ next, initialError }: { next: string; initialError?: string }) {
  const [tab, setTab] = useState<Tab>("grownups");

  return (
    <div>
      <div className="mb-5 grid grid-cols-2 gap-1.5 rounded-xl border-2 border-ink bg-cream p-1">
        <TabButton active={tab === "grownups"} onClick={() => setTab("grownups")} color="bg-ocean text-white">
          👋 Sign in
        </TabButton>
        <TabButton active={tab === "kids"} onClick={() => setTab("kids")} color="bg-berry text-white">
          🧒 Kid login
        </TabButton>
      </div>

      {initialError && <Alert kind="error">{initialError}</Alert>}

      {tab === "kids" ? <KidForm next={next} /> : <GrownUpForms next={next} />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-lg px-3 py-2 font-display font-semibold transition ${
        active ? color : "text-ink/70 hover:bg-white"
      }`}
    >
      {children}
    </button>
  );
}

function Alert({ kind, children }: { kind: "error" | "ok"; children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={`mb-4 rounded-xl border-2 px-4 py-3 text-sm font-semibold ${
        kind === "error" ? "border-berry bg-berry/10 text-berry" : "border-mint bg-mint/10 text-mint"
      }`}
    >
      {children}
    </p>
  );
}

function KidForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signInKid, null);
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <p className="text-center font-display text-lg">Type your username and secret PIN!</p>
      {state?.error && <Alert kind="error">{state.error}</Alert>}
      <div>
        <label className="label" htmlFor="kid-username">Username</label>
        <input
          id="kid-username"
          name="username"
          className="input text-lg"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="e.g. super_sam"
          required
        />
      </div>
      <div>
        <label className="label" htmlFor="kid-pin">Secret PIN</label>
        <input
          id="kid-pin"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4,8}"
          maxLength={8}
          className="input border-ink bg-ink text-center font-marquee text-3xl tracking-[0.5em] text-sunny placeholder:text-white/25 focus:border-ocean"
          autoComplete="current-password"
          placeholder="••••"
          required
        />
      </div>
      <button className="btn btn-berry w-full py-3 text-lg" disabled={pending}>
        {pending ? "Checking…" : "Let's play! 🎮"}
      </button>
      <p className="text-center text-sm text-ink/60">No account yet? Ask a grown-up to make one for you.</p>
    </form>
  );
}

function GrownUpForms({ next }: { next: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [inState, inAction, inPending] = useActionState<FormState, FormData>(signInWithEmail, null);
  const [upState, upAction, upPending] = useActionState<FormState, FormData>(signUpWithEmail, null);

  return (
    <div className="space-y-4">
      <form action={signInWithGoogle}>
        <input type="hidden" name="next" value={next} />
        <button className="btn btn-white w-full py-3">
          <GoogleIcon /> Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3 text-sm font-bold text-ink/50">
        <span className="h-0.5 flex-1 bg-ink/15" /> or use email <span className="h-0.5 flex-1 bg-ink/15" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setMode("signin")}
          aria-pressed={mode === "signin"}
          className={`btn btn-sm ${mode === "signin" ? "btn-ocean" : "btn-white"}`}
        >
          I have an account
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          aria-pressed={mode === "signup"}
          className={`btn btn-sm ${mode === "signup" ? "btn-mint" : "btn-white"}`}
        >
          ✨ Create account
        </button>
      </div>

      {mode === "signin" ? (
        <form action={inAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          {inState?.error && <Alert kind="error">{inState.error}</Alert>}
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input id="email" name="email" type="email" className="input" autoComplete="email" required />
          </div>
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
          </div>
          <button className="btn btn-ocean w-full py-3" disabled={inPending}>
            {inPending ? "Signing in…" : "Sign in"}
          </button>
        </form>
      ) : (
        <form action={upAction} className="space-y-3">
          {upState?.error && <Alert kind="error">{upState.error}</Alert>}
          {upState?.message ? (
            <Alert kind="ok">{upState.message}</Alert>
          ) : (
            <>
              <div>
                <label className="label" htmlFor="name">Your name</label>
                <input id="name" name="name" className="input" autoComplete="name" maxLength={40} required />
              </div>
              <div>
                <label className="label" htmlFor="su-email">Email</label>
                <input id="su-email" name="email" type="email" className="input" autoComplete="email" required />
              </div>
              <div>
                <label className="label" htmlFor="su-password">Password (8+ characters)</label>
                <input
                  id="su-password"
                  name="password"
                  type="password"
                  minLength={8}
                  className="input"
                  autoComplete="new-password"
                  required
                />
              </div>
              <button className="btn btn-mint w-full py-3" disabled={upPending}>
                {upPending ? "Creating…" : "Create account"}
              </button>
            </>
          )}
        </form>
      )}
      <p className="text-center text-xs text-ink/50">New accounts wait for a family admin to say yes.</p>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
