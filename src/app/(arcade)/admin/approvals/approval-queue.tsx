"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Play, Undo2 } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import type { GameCard } from "@/lib/types";
import { approveGame, rejectGame } from "../actions";

type Pending = GameCard & { maker: string };

export function ApprovalQueue({ games }: { games: Pending[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusy(id);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? { kind: "ok", text: success } : { kind: "error", text: res.error ?? "Something went wrong." });
      setBusy(null);
    });
  }

  return (
    <div className="space-y-4">
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
      {games.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-6xl" aria-hidden>🎉</div>
          <p className="mt-3 font-display text-xl font-semibold">All caught up! Nothing to review.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {games.map((g) => (
            <Row key={g.id} game={g} busy={busy === g.id} run={run} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  game: g,
  busy,
  run,
}: {
  game: Pending;
  busy: boolean;
  run: (id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
}) {
  const [sendingBack, setSendingBack] = useState(false);
  const [note, setNote] = useState("");

  return (
    <li className={`card border-sunny p-4 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="h-28 w-full shrink-0 overflow-hidden rounded-2xl border-2 border-ink sm:w-40">
          <GameCover title={g.title} thumbnailUrl={g.thumbnail_url} emoji={g.cover_emoji} color={g.cover_color} small />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-bold">{g.title}</h3>
          <p className="text-sm text-ink/70">
            by <strong>{g.maker}</strong> · asked {new Date(g.updated_at).toLocaleDateString()}
          </p>
          {g.description && <p className="mt-1 line-clamp-2 text-sm text-ink/70">{g.description}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/play/${g.slug}`} className="btn btn-white btn-sm">
            <Play className="h-4 w-4" /> Play it first
          </Link>
          <button
            type="button"
            className="btn btn-mint btn-sm"
            disabled={busy}
            onClick={() => run(g.id, () => approveGame(g.id), `"${g.title}" is now on the family arcade! 🎉`)}
          >
            <Check className="h-4 w-4" /> Approve
          </button>
          <button type="button" className="btn btn-white btn-sm" disabled={busy} onClick={() => setSendingBack((v) => !v)} aria-expanded={sendingBack}>
            <Undo2 className="h-4 w-4" /> Send back
          </button>
        </div>
      </div>
      {sendingBack && (
        <form
          className="mt-4 flex flex-col gap-3 rounded-2xl bg-cream p-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            run(g.id, () => rejectGame(g.id, note), `Sent "${g.title}" back with your note.`);
            setSendingBack(false);
          }}
        >
          <label className="flex-1">
            <span className="label">What should they change? (they&apos;ll see this)</span>
            <input
              className="input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              placeholder="Great start! Can you make the monsters less scary?"
            />
          </label>
          <button className="btn btn-berry btn-sm">Send back</button>
        </form>
      )}
    </li>
  );
}
