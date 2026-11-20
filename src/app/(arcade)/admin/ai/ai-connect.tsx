"use client";

import { useState, useTransition } from "react";
import { ExternalLink, PlugZap, Unplug } from "lucide-react";
import type { Provider } from "@/lib/ai/providers";
import { connectWithKey, disconnectAI, setKidDefaultLimit, setMemberAI, startOpenRouterConnect, testConnection } from "./actions";

export type MemberSpend = {
  id: string;
  name: string;
  emoji: string;
  role: string | null;
  isMe: boolean;
  enabled: boolean;
  ownLimit: number | null;
  limit: number | null;
  spent: number;
};

type Notice = { kind: "ok" | "error"; text: string } | null;

const money = (n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

export function AIConnect({
  connection,
  providers,
  kidDefault,
  totalSpent,
  members,
  notice: initialNotice,
}: {
  connection: { provider: Provider; providerLabel: string; model: string; keyHint: string; connectedAt: string; lastError: string | null } | null;
  providers: { id: Provider; label: string; company: string; keyUrl: string; steps: string[] }[];
  kidDefault: number;
  totalSpent: number;
  members: MemberSpend[];
  notice: Notice;
}) {
  const [notice, setNotice] = useState<Notice>(initialNotice);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? (success ? { kind: "ok", text: success } : null) : { kind: "error", text: res.error ?? "Something went wrong." });
    });
  }

  return (
    <div className="space-y-8">
      {notice && (
        <p
          role="alert"
          className={`rounded-2xl border-2 px-4 py-3 font-semibold ${
            notice.kind === "ok" ? "border-mint bg-mint/10 text-mint" : "border-berry bg-berry/10 text-berry"
          }`}
        >
          {notice.text}
        </p>
      )}

      <section>
        <h2 className="text-2xl font-bold">🤖 The AI that builds your games</h2>
        <p className="mt-1 max-w-2xl text-ink/70">
          Everyone in the family, kids included, builds games using the AI account you connect here. It&apos;s billed to
          your account, so kids never need their own, and the limits below keep spending in check.
        </p>
      </section>

      {connection ? (
        <Connected connection={connection} pending={pending} run={run} setNotice={setNotice} />
      ) : (
        <NotConnected providers={providers} pending={pending} run={run} />
      )}

      <Spending kidDefault={kidDefault} totalSpent={totalSpent} members={members} pending={pending} run={run} />
    </div>
  );
}

function Connected({
  connection: c,
  pending,
  run,
  setNotice,
}: {
  connection: NonNullable<Parameters<typeof AIConnect>[0]["connection"]>;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void;
  setNotice: (n: Notice) => void;
}) {
  const [testing, startTest] = useTransition();
  return (
    <section className={`card p-5 ${c.lastError ? "border-berry" : "border-mint"}`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border-2 border-ink bg-mint/15 text-3xl" aria-hidden>
          {c.lastError ? "⚠️" : "✅"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xl font-bold">Connected to {c.providerLabel}</p>
          <p className="text-sm text-ink/65">
            Key {c.keyHint} · builds with <strong>{c.model}</strong> · since {new Date(c.connectedAt).toLocaleDateString()}
          </p>
          {c.lastError && <p className="mt-2 text-sm font-semibold text-berry">Last problem: {c.lastError}</p>}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            className="btn btn-ocean btn-sm"
            disabled={pending || testing}
            onClick={() =>
              startTest(async () => {
                setNotice(null);
                const res = await testConnection();
                setNotice(
                  res.ok
                    ? { kind: "ok", text: `It works! The AI says: “${res.data?.reply}” (cost ${money(res.data?.cost ?? 0)})` }
                    : { kind: "error", text: res.error },
                );
              })
            }
          >
            <PlugZap className="h-4 w-4" /> {testing ? "Testing…" : "Test"}
          </button>
          <button
            className="btn btn-white btn-sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Disconnect the AI? Nobody in the family can build games until you connect again.")) {
                run(() => disconnectAI(), "Disconnected. Your key has been deleted from Family Arcade.");
              }
            }}
          >
            <Unplug className="h-4 w-4" /> Disconnect
          </button>
        </div>
      </div>
      {c.provider === "openrouter" && (
        <p className="mt-4 rounded-xl bg-cream p-3 text-sm text-ink/75">
          Top up credit or set a spending cap any time on{" "}
          <a className="font-semibold text-ocean underline" href="https://openrouter.ai/settings/credits" target="_blank" rel="noreferrer">
            OpenRouter
          </a>
          . The family limits below apply on top of that.
        </p>
      )}
    </section>
  );
}

function NotConnected({
  providers,
  pending,
  run,
}: {
  providers: { id: Provider; label: string; company: string; keyUrl: string; steps: string[] }[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void;
}) {
  const [provider, setProvider] = useState<Provider>(providers[0].id);
  const [key, setKey] = useState("");
  const chosen = providers.find((p) => p.id === provider)!;

  return (
    <div className="space-y-4">
      <section className="card border-grape p-6">
        <span className="chip mb-3 border-grape bg-grape text-xs text-white">Easiest · recommended</span>
        <h3 className="text-2xl font-bold">Connect your AI account</h3>
        <p className="mt-1 max-w-2xl text-ink/75">
          One account works with Claude, ChatGPT and Gemini. You sign in on <strong>OpenRouter&apos;s own page</strong>,
          so your password never touches Family Arcade, then come straight back.
        </p>
        <ol className="mt-4 grid gap-2 sm:grid-cols-3">
          {["Press the button below", "Sign in (Google works) and add a little credit, e.g. $10", "Press Authorize: you're done!"].map((s, i) => (
            <li key={s} className="flex items-start gap-2 rounded-xl bg-cream p-3 text-sm font-semibold">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-grape text-xs text-white">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <form action={startOpenRouterConnect} className="mt-5">
          <button className="btn btn-grape py-3 text-lg">
            <PlugZap className="h-5 w-5" /> Connect AI account
          </button>
        </form>
      </section>

      <details className="card p-5">
        <summary className="cursor-pointer font-display text-lg font-semibold">I already have a Claude, OpenAI or Gemini API key</summary>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => connectWithKey(provider, key), "🎉 Connected! Press Test to make sure it works.");
            setKey("");
          }}
        >
          <fieldset>
            <legend className="label">Which company is the key from?</legend>
            <div className="flex flex-wrap gap-2">
              {providers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={provider === p.id}
                  onClick={() => setProvider(p.id)}
                  className={`chip ${provider === p.id ? "bg-ink text-white" : "hover:bg-cream"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </fieldset>
          <ol className="list-inside list-decimal space-y-1 rounded-xl bg-cream p-3 text-sm">
            {chosen.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <a href={chosen.keyUrl} target="_blank" rel="noreferrer" className="btn btn-white btn-sm">
            <ExternalLink className="h-4 w-4" /> Open the {chosen.company} key page
          </a>
          <label className="block">
            <span className="label">Paste your key</span>
            <input
              className="input font-mono"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Paste it here"
              required
            />
          </label>
          <p className="text-xs text-ink/60">We check the key works, then store it encrypted. Kids can never see it.</p>
          <button className="btn btn-mint" disabled={pending || !key.trim()}>
            {pending ? "Checking…" : "Check and connect"}
          </button>
        </form>
      </details>
    </div>
  );
}

function Spending({
  kidDefault,
  totalSpent,
  members,
  pending,
  run,
}: {
  kidDefault: number;
  totalSpent: number;
  members: MemberSpend[];
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void;
}) {
  const [def, setDef] = useState(String(kidDefault));
  const month = new Date().toLocaleDateString(undefined, { month: "long" });

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <h2 className="mr-auto text-2xl font-bold">
          💰 Spending in {month} <span className="text-ink/50">({money(totalSpent)})</span>
        </h2>
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setKidDefaultLimit(Number(def)), "Kids' monthly limit saved.");
          }}
        >
          <label>
            <span className="label">Each kid can spend up to</span>
            <span className="flex items-center gap-1">
              <span className="font-bold">$</span>
              <input className="input w-24 py-1.5" inputMode="decimal" value={def} onChange={(e) => setDef(e.target.value)} />
              <span className="text-sm font-semibold text-ink/60">/month</span>
            </span>
          </label>
          <button className="btn btn-ocean btn-sm" disabled={pending || Number(def) === kidDefault}>
            Save
          </button>
        </form>
      </div>
      <ul className="space-y-2">
        {members.map((m) => (
          <MemberRow key={m.id} m={m} pending={pending} run={run} />
        ))}
      </ul>
      <p className="mt-3 text-sm text-ink/60">
        Limits reset on the 1st of each month. When someone stops at their limit, you can raise it here.
      </p>
    </section>
  );
}

function MemberRow({
  m,
  pending,
  run,
}: {
  m: MemberSpend;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(m.ownLimit === null ? "" : String(m.ownLimit));
  const pct = m.limit ? Math.min(100, (m.spent / m.limit) * 100) : 0;
  const isKid = m.role === "kid";

  return (
    <li className={`card p-3 ${m.enabled ? "" : "opacity-70"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl" aria-hidden>{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">
            {m.name} {m.isMe && <span className="text-sm text-ocean">(you)</span>}
            {!m.enabled && <span className="chip ml-2 text-xs">AI paused</span>}
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm text-ink/70">
            <span className="font-semibold">{money(m.spent)}</span>
            <span>of {m.limit === null ? "no limit" : `${money(m.limit)}${isKid && m.ownLimit === null ? " (kid default)" : ""}`}</span>
          </div>
          {m.limit !== null && (
            <div className="mt-1.5 h-2.5 w-full max-w-xs overflow-hidden rounded-full border-2 border-ink bg-cream" aria-hidden>
              <div className={`h-full ${pct >= 100 ? "bg-berry" : pct > 75 ? "bg-sunny" : "bg-mint"}`} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button className="btn btn-white btn-sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
            Limit
          </button>
          {!m.isMe && (
            <button
              className={`btn btn-sm ${m.enabled ? "btn-white" : "btn-mint"}`}
              disabled={pending}
              onClick={() => run(() => setMemberAI(m.id, { enabled: !m.enabled }), m.enabled ? `AI paused for ${m.name}.` : `AI back on for ${m.name}.`)}
            >
              {m.enabled ? "Pause AI" : "Turn AI on"}
            </button>
          )}
        </div>
      </div>
      {editing && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2 rounded-xl bg-cream p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => setMemberAI(m.id, { limit: value.trim() === "" ? null : Number(value) }), "Limit saved.");
            setEditing(false);
          }}
        >
          <label>
            <span className="label">Monthly limit for {m.name} ($)</span>
            <input className="input w-28 py-1.5" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={isKid ? "default" : "no limit"} />
          </label>
          <button className="btn btn-mint btn-sm">Save</button>
          <p className="basis-full text-xs text-ink/60">Leave empty to use {isKid ? "the kid default" : "no limit"}.</p>
        </form>
      )}
    </li>
  );
}
