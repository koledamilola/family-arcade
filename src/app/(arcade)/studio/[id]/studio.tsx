"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Bug, Expand, Hammer, ListPlus, MessageCircle, Play, RotateCcw, Send, Sparkles, Trash2, X } from "lucide-react";
import { GAME_SANDBOX, injectShim } from "@/lib/game-shim";
import { restoreVersion, sendMessage, shareProject } from "../actions";

type Plan = {
  title: string;
  emoji: string;
  pitch: string;
  genre: string;
  player: string;
  goal: string;
  danger: string;
  controls_keyboard: string;
  controls_touch: string;
  look: string;
  sounds: string;
  has_scores: boolean;
  score_label: string;
  difficulty: string;
  first_version: string[];
  later_ideas: string[];
};

export type StudioMessage = {
  id: number;
  role: "user" | "assistant" | "system";
  kind: "chat" | "plan" | "build" | "error" | "note";
  content: string;
  data: { suggestions?: string[]; off_topic?: boolean; version?: number; changes?: string[] } | Plan | null;
  cost_usd: number;
  created_at: string;
};

type Props = {
  project: { id: string; title: string; stage: "interview" | "plan" | "built"; plan: Plan | null };
  isOwner: boolean;
  ownerName: string;
  isKid: boolean;
  ownerIsKid: boolean;
  messages: StudioMessage[];
  versions: { version: number; summary: string; created_at: string }[];
  latestHtml: string | null;
  latestVersion: number;
  game: { slug: string; status: string; reviewNote: string | null } | null;
  ai: {
    connected: boolean;
    enabled: boolean;
    left: number | null;
    estimates: { message: number; build: number; perChange: number[] } | null;
  };
};

const money = (n: number) => (n < 0.01 ? "under 1¢" : n < 1 ? `about ${Math.round(n * 100)}¢` : `about $${n.toFixed(2)}`);

export function Studio(props: Props) {
  const { project, isOwner, ai } = props;
  const router = useRouter();
  const [tab, setTab] = useState<"chat" | "play">(props.latestHtml ? "play" : "chat");
  const [error, setError] = useState<string | null>(null);
  const [build, setBuild] = useState<{ label: string; expected: number; chars: number } | null>(null);
  const canAct = isOwner && ai.connected && ai.enabled && (ai.left === null || ai.left > 0);
  const blockedReason = !isOwner
    ? `You're viewing ${props.ownerName}'s project.`
    : !ai.connected
      ? props.isKid
        ? "The AI helper isn't set up yet. Ask a parent to connect it."
        : "Connect an AI account first (Family → AI)."
      : !ai.enabled
        ? "AI is paused for your account."
        : ai.left !== null && ai.left <= 0
          ? props.isKid
            ? "You've used all your AI building for this month! Ask a parent for a bit more."
            : "You've reached your AI limit for this month."
          : null;

  async function runBuild(mode: "build" | "changes", changes: string[] = []) {
    setError(null);
    const expected = mode === "build" ? 38_000 : (900 + 700 * changes.length) * 3.5;
    setBuild({ label: mode === "build" ? "Building your game" : `Making ${changes.length} change${changes.length === 1 ? "" : "s"}`, expected, chars: 0 });
    setTab("play");
    try {
      const res = await fetch(`/api/studio/${project.id}/build`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, changes }),
      });
      if (!res.body) throw new Error("Couldn't reach the server.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finished = false;
      while (!finished) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const evt = JSON.parse(line) as { t: string; chars?: number; message?: string };
          if (evt.t === "progress") setBuild((b) => (b ? { ...b, chars: evt.chars ?? 0 } : b));
          if (evt.t === "error") throw new Error(evt.message);
          if (evt.t === "done") finished = true;
        }
      }
      if (!finished) throw new Error("The connection dropped before the game finished. Check your games list in a minute, then try again.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBuild(null);
      router.refresh();
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-3 py-4 sm:px-4 sm:py-6">
      <TopBar {...props} />

      {/* Phone: switch between chat and game */}
      <div className="mb-3 grid grid-cols-2 gap-1.5 rounded-xl border-2 border-ink bg-white p-1 lg:hidden">
        {(["chat", "play"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-pressed={tab === t}
            className={`rounded-lg px-3 py-2 font-display font-semibold ${tab === t ? "bg-grape text-white" : "text-ink/70"}`}
          >
            {t === "chat" ? "💬 Coach" : "🎮 Game"}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mb-3 flex items-start gap-2 rounded-2xl border-2 border-berry bg-berry/10 px-4 py-3 font-semibold text-berry">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-5 w-5" />
          </button>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <section className={`${tab === "chat" ? "" : "hidden"} lg:block`}>
          <Chat {...props} canAct={canAct} blockedReason={blockedReason} busy={Boolean(build)} onError={setError} runBuild={runBuild} />
        </section>
        <section className={`${tab === "play" ? "" : "hidden"} lg:block`}>
          <Preview {...props} build={build} canAct={canAct} onError={setError} />
        </section>
      </div>
    </main>
  );
}

function TopBar({ project, isOwner, ownerName, ai, game, isKid }: Props) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <Link href="/studio" className="btn btn-white btn-sm">
        ← Studio
      </Link>
      <h1 className="mr-auto min-w-0 truncate text-2xl font-bold sm:text-3xl">
        {project.plan?.emoji ?? "💡"} {project.title}
      </h1>
      {!isOwner && <span className="chip text-xs">by {ownerName}</span>}
      {game?.status === "published" && (
        <Link href={`/play/${game.slug}`} className="chip border-mint bg-mint/10 text-xs text-mint">
          ✅ On the arcade
        </Link>
      )}
      {game?.status === "pending" && <span className="chip border-sunny bg-sunny/20 text-xs">⏳ Waiting for a parent</span>}
      {isOwner && ai.left !== null && (
        <span className="chip text-xs" title="AI credit left this month">
          {isKid ? "⚡" : "💰"} ${ai.left.toFixed(2)} left this month
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- chat side

function Chat({
  project,
  messages,
  isOwner,
  isKid,
  ai,
  latestVersion,
  canAct,
  blockedReason,
  busy,
  onError,
  runBuild,
}: Props & {
  canAct: boolean;
  blockedReason: string | null;
  busy: boolean;
  onError: (e: string | null) => void;
  runBuild: (mode: "build" | "changes", changes?: string[]) => Promise<boolean>;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [thinking, startThinking] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const lastPlanId = [...messages].reverse().find((m) => m.kind === "plan")?.id;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pendingText]);

  function send(value: string) {
    const v = value.trim();
    if (!v || thinking) return;
    onError(null);
    setPendingText(v);
    setText("");
    startThinking(async () => {
      const res = await sendMessage(project.id, v);
      if (!res.ok) onError(res.error);
      setPendingText(null);
      router.refresh();
    });
  }

  const built = project.stage === "built" && latestVersion > 0;

  return (
    <div className="card flex h-[calc(100dvh-220px)] min-h-[480px] flex-col overflow-hidden p-0 lg:h-[calc(100dvh-170px)]">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && !pendingText && (
          <Bubble side="left">
            {isKid ? "Hi! I'm your Game Coach 🎮 What game do you want to make?" : "Hi! I'm your Game Coach. What game would you like to make?"}
          </Bubble>
        )}
        {messages.map((m) => (
          <MessageView
            key={m.id}
            m={m}
            isLatestPlan={m.id === lastPlanId}
            showSuggestions={canAct && !thinking && !busy && m.id === lastAssistant?.id && project.stage !== "built"}
            onSuggestion={send}
            canBuild={canAct && !busy && project.stage === "plan"}
            buildCost={ai.estimates?.build}
            onBuild={() => runBuild("build")}
          />
        ))}
        {pendingText && (
          <>
            <Bubble side="right">{pendingText}</Bubble>
            <Bubble side="left">
              <span className="inline-flex items-center gap-2 text-ink/60">
                <span className="animate-pulse">●●●</span> The coach is thinking…
              </span>
            </Bubble>
          </>
        )}
        <div ref={endRef} />
      </div>

      <div className="border-t-2 border-ink/10 bg-cream/60 p-3">
        {blockedReason ? (
          <p className="text-center text-sm font-semibold text-ink/70">{blockedReason}</p>
        ) : built ? (
          <ChangeList ai={ai} disabled={busy || !canAct} isKid={isKid} onApply={(c) => runBuild("changes", c)} />
        ) : (
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault();
              send(text);
            }}
          >
            <div className="flex gap-2">
              <input
                className="input flex-1"
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={500}
                placeholder={project.stage === "plan" ? "Want to change the plan? Say what…" : "Type your answer…"}
                disabled={thinking || busy || !isOwner}
                aria-label="Message the coach"
              />
              <button className="btn btn-grape" disabled={thinking || busy || !text.trim()} aria-label="Send">
                <Send className="h-5 w-5" />
              </button>
            </div>
            <p className="text-xs text-ink/55">
              💡 Short answers are perfect.
              {project.stage === "plan" ? " Check the plan carefully: changing it now is cheap, changing a built game costs more." : " Say “you decide” to let the coach pick."}
              {ai.estimates && ` Each message costs ${money(ai.estimates.message)}.`}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}

function Bubble({ side, tone, children }: { side: "left" | "right"; tone?: "error" | "ok" | "muted"; children: React.ReactNode }) {
  const toneCls =
    tone === "error"
      ? "border-berry bg-berry/10 text-berry"
      : tone === "ok"
        ? "border-mint bg-mint/10"
        : tone === "muted"
          ? "border-ink/20 bg-cream text-ink/70"
          : side === "right"
            ? "border-ink bg-ocean text-white"
            : "border-ink bg-white";
  return (
    <div className={`flex ${side === "right" ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[88%] whitespace-pre-line rounded-2xl border-2 px-3.5 py-2.5 ${toneCls}`}>{children}</div>
    </div>
  );
}

function MessageView({
  m,
  isLatestPlan,
  showSuggestions,
  onSuggestion,
  canBuild,
  buildCost,
  onBuild,
}: {
  m: StudioMessage;
  isLatestPlan: boolean;
  showSuggestions: boolean;
  onSuggestion: (s: string) => void;
  canBuild: boolean;
  buildCost?: number;
  onBuild: () => void;
}) {
  if (m.kind === "note") {
    const changes = (m.data as { changes?: string[] } | null)?.changes;
    return changes ? (
      <Bubble side="right">
        <span className="mb-1 block text-xs font-bold uppercase opacity-80">Change list</span>
        {changes.map((c) => `• ${c}`).join("\n")}
      </Bubble>
    ) : (
      <p className="text-center text-xs font-semibold text-ink/55">{m.content}</p>
    );
  }
  if (m.role === "user") return <Bubble side="right">{m.content}</Bubble>;
  if (m.kind === "error") return <Bubble side="left" tone="error">⚠️ {m.content}</Bubble>;
  if (m.kind === "build") {
    const v = (m.data as { version?: number } | null)?.version;
    return (
      <Bubble side="left" tone="ok">
        <span className="mb-1 block text-xs font-bold text-mint uppercase">🎉 Version {v} is ready. Try it!</span>
        {m.content}
      </Bubble>
    );
  }
  if (m.kind === "plan" && m.data) {
    return (
      <div className="space-y-2">
        <Bubble side="left">{m.content}</Bubble>
        <PlanCard plan={m.data as Plan} faded={!isLatestPlan} />
        {isLatestPlan && canBuild && (
          <button type="button" onClick={onBuild} className="btn btn-mint w-full py-3 text-lg">
            <Hammer className="h-5 w-5" /> Build it!{buildCost !== undefined && <span className="text-sm font-semibold opacity-80">({money(buildCost)})</span>}
          </button>
        )}
      </div>
    );
  }
  const data = m.data as { suggestions?: string[]; off_topic?: boolean } | null;
  return (
    <div className="space-y-2">
      <Bubble side="left" tone={data?.off_topic ? "muted" : undefined}>
        {data?.off_topic && <span className="mb-1 block text-xs font-bold uppercase">🎮 Games only</span>}
        {m.content}
      </Bubble>
      {showSuggestions && data?.suggestions && data.suggestions.length > 0 && (
        <div className="flex flex-wrap gap-2 pl-1">
          {data.suggestions.map((s) => (
            <button key={s} type="button" className="chip bg-white hover:bg-sunny" onClick={() => onSuggestion(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, faded }: { plan: Plan; faded: boolean }) {
  const rows: [string, string][] = [
    ["🕹️ You play", plan.player],
    ["🏆 Goal", plan.goal],
    ["💥 You lose when", plan.danger],
    ["⌨️ Keys", plan.controls_keyboard],
    ["📱 Touch", plan.controls_touch],
    ["🎨 Looks", plan.look],
    ["🔊 Sounds", plan.sounds],
    ["📈 Gets harder", plan.difficulty],
  ];
  return (
    <div className={`rounded-2xl border-2 border-grape bg-white p-4 ${faded ? "opacity-60" : ""}`}>
      <p className="text-xs font-bold text-grape uppercase">📋 Game plan {faded && "(older)"}</p>
      <h3 className="text-xl font-bold">
        {plan.emoji} {plan.title}
      </h3>
      <p className="text-ink/75">{plan.pitch}</p>
      <dl className="mt-3 space-y-1.5 text-sm">
        {rows
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-2">
              <dt className="font-bold text-ink/60">{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {plan.first_version.length > 0 && (
        <>
          <p className="mt-3 text-sm font-bold">First version has:</p>
          <ul className="list-inside list-disc text-sm">
            {plan.first_version.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </>
      )}
      {plan.later_ideas.length > 0 && (
        <p className="mt-2 text-xs text-ink/60">
          <strong>Ideas for later:</strong> {plan.later_ideas.join(" · ")}
        </p>
      )}
    </div>
  );
}

const BUG_TEMPLATE = "When I ___, ___ happens. It should ___.";

function ChangeList({
  ai,
  disabled,
  isKid,
  onApply,
}: {
  ai: Props["ai"];
  disabled: boolean;
  isKid: boolean;
  onApply: (changes: string[]) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState("");
  const [items, setItems] = useState<string[]>([]);
  const max = ai.estimates?.perChange.length ?? 6;
  const cost = items.length ? ai.estimates?.perChange[items.length - 1] : undefined;
  const vague = draft.trim().length > 0 && draft.trim().split(/\s+/).length < 4;

  function add() {
    const v = draft.trim();
    if (!v || items.length >= max) return;
    setItems([...items, v]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">
        <ListPlus className="mr-1 inline h-4 w-4" /> What should change? {isKid ? "Add a few things, then press Make changes!" : "Collect several changes, then apply them together."}
      </p>
      {items.length > 0 && (
        <ol className="space-y-1">
          {items.map((it, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg bg-white px-2.5 py-1.5 text-sm">
              <span className="font-bold text-grape">{i + 1}.</span>
              <span className="flex-1">{it}</span>
              <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label="Remove">
                <Trash2 className="h-4 w-4 text-ink/50" />
              </button>
            </li>
          ))}
        </ol>
      )}
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className="input flex-1 py-2"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={300}
          placeholder={items.length >= max ? "That's the most for one go" : "e.g. Make the cat jump higher"}
          disabled={disabled || items.length >= max}
          aria-label="Describe a change"
        />
        <button className="btn btn-white btn-sm" disabled={disabled || !draft.trim() || items.length >= max}>
          Add
        </button>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="text-xs font-bold text-ocean underline" onClick={() => setDraft(BUG_TEMPLATE)} disabled={disabled}>
          <Bug className="mr-0.5 inline h-3.5 w-3.5" /> Report a bug
        </button>
        <span className="flex-1" />
        <button
          type="button"
          className="btn btn-mint btn-sm"
          disabled={disabled || items.length === 0}
          onClick={async () => {
            const ok = await onApply(items);
            if (ok) setItems([]);
          }}
        >
          <Sparkles className="h-4 w-4" /> Make {items.length || ""} change{items.length === 1 ? "" : "s"}
          {cost !== undefined && <span className="opacity-80">({money(cost)})</span>}
        </button>
      </div>
      <p className="text-xs text-ink/55">
        {vague
          ? "💡 Be specific! “Make the jump higher and slower” works better than “fix jump”."
          : "💡 One go with 3 changes costs much less than 3 goes with 1 change. Say exactly what to change and how."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- game side

function Preview({
  project,
  latestHtml,
  latestVersion,
  versions,
  isOwner,
  isKid,
  game,
  build,
  onError,
}: Props & { build: { label: string; expected: number; chars: number } | null; canAct: boolean; onError: (e: string | null) => void }) {
  const router = useRouter();
  const [frameKey, setFrameKey] = useState(0);
  const [sharing, startSharing] = useTransition();
  const [restoring, startRestoring] = useTransition();
  const [shared, setShared] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const srcDoc = useMemo(() => (latestHtml ? injectShim(latestHtml) : null), [latestHtml]);
  const pct = build ? Math.min(97, Math.round((build.chars / build.expected) * 100)) : 0;

  return (
    <div className="space-y-3">
      <div className="rounded-[22px] border-2 border-ink bg-ink p-2 shadow-pop [--ledge:#07051a]">
        <div ref={stageRef} className="game-stage relative overflow-hidden rounded-2xl border-2 border-black bg-black">
          {srcDoc ? (
            <iframe
              key={`${latestVersion}-${frameKey}`}
              srcDoc={srcDoc}
              title={project.title}
              sandbox={GAME_SANDBOX}
              allow="fullscreen; gamepad; autoplay"
              className="block aspect-[4/3] max-h-[70vh] w-full bg-black sm:aspect-video"
            />
          ) : (
            <div className="grid aspect-[4/3] place-items-center p-6 text-center text-white sm:aspect-video">
              <div>
                <div className="text-5xl" aria-hidden>
                  {project.stage === "plan" ? "📋" : "💬"}
                </div>
                <p className="mt-2 font-display text-lg">
                  {project.stage === "plan" ? "Your plan is ready. Press Build it! when you're happy with it." : "Chat with the coach to plan your game. It will appear here!"}
                </p>
              </div>
            </div>
          )}
          {build && (
            <div className="absolute inset-0 grid place-items-center bg-ink/85 p-6 text-center text-white">
              <div className="w-full max-w-sm">
                <div className="animate-bounce text-5xl" aria-hidden>
                  🛠️
                </div>
                <p className="mt-2 font-display text-xl">{build.label}…</p>
                <div className="mt-3 h-4 overflow-hidden rounded-full border-2 border-white/40 bg-white/10" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-sunny transition-all" style={{ width: `${Math.max(4, pct)}%` }} />
                </div>
                <p className="mt-2 text-sm text-white/70">
                  {build.chars === 0 ? "Getting started…" : `Writing code… ${pct}%`} This usually takes 1-3 minutes. Keep this page open.
                </p>
              </div>
            </div>
          )}
        </div>
        {srcDoc && (
          <div className="flex flex-wrap items-center gap-2 px-1 pt-2">
            <button type="button" className="btn btn-white btn-sm" onClick={() => setFrameKey((k) => k + 1)}>
              <RotateCcw className="h-4 w-4" /> Restart
            </button>
            <button
              type="button"
              className="btn btn-white btn-sm"
              onClick={() => stageRef.current?.requestFullscreen?.().catch(() => onError("Fullscreen isn't available here."))}
            >
              <Expand className="h-4 w-4" /> Fullscreen
            </button>
            <span className="ml-auto text-xs text-white/60">Version {latestVersion} · click the game first so it hears the keys</span>
          </div>
        )}
      </div>

      {latestVersion > 0 && isOwner && (
        <div className="card p-4">
          {shared ? (
            <p className="font-semibold text-mint">{shared}</p>
          ) : game?.status === "rejected" ? (
            <p className="mb-2 text-sm">
              <strong>A parent sent this back:</strong> “{game.reviewNote || "Have another look and try again."}” Make changes, then send it again.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn btn-grape"
              disabled={sharing || Boolean(build)}
              onClick={() =>
                startSharing(async () => {
                  onError(null);
                  const res = await shareProject(project.id);
                  if (!res.ok) onError(res.error);
                  else {
                    setShared(
                      res.data?.status === "pending"
                        ? "📨 Sent! A parent will play it and approve it for the arcade."
                        : "🎉 It's on the family arcade!",
                    );
                    router.refresh();
                  }
                })
              }
            >
              <Play className="h-4 w-4" />
              {sharing
                ? "Sending…"
                : isKid
                  ? game
                    ? "Send the newest version to a parent"
                    : "Ask a parent to put it on the arcade"
                  : game
                    ? "Update it on the arcade"
                    : "Put it on the family arcade"}
            </button>
            {game?.status === "published" && (
              <Link href={`/play/${game.slug}`} className="btn btn-white btn-sm">
                Play on the arcade
              </Link>
            )}
          </div>
          {isKid && <p className="mt-2 text-xs text-ink/55">Kids&apos; games appear on the arcade after a parent says OK.</p>}
        </div>
      )}

      {versions.length > 1 && isOwner && (
        <details className="card p-4">
          <summary className="cursor-pointer font-display font-semibold">
            <MessageCircle className="mr-1 inline h-4 w-4" /> All versions ({versions.length})
          </summary>
          <ul className="mt-3 space-y-2">
            {versions.map((v) => (
              <li key={v.version} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
                <strong>v{v.version}</strong>
                <span className="min-w-0 flex-1 truncate text-ink/70">{v.summary || "—"}</span>
                {v.version !== latestVersion && (
                  <button
                    className="btn btn-white btn-sm"
                    disabled={restoring || Boolean(build)}
                    onClick={() =>
                      startRestoring(async () => {
                        const res = await restoreVersion(project.id, v.version);
                        if (!res.ok) onError(res.error);
                        router.refresh();
                      })
                    }
                  >
                    Go back to this (free)
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
