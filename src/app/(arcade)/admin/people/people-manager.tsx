"use client";

import { useState, useTransition } from "react";
import { Check, KeyRound, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { AVATAR_EMOJIS } from "@/lib/catalog";
import type { Profile, Role } from "@/lib/types";
import { createKidAccount, deleteUser, resetKidPin, setRole, updateProfile } from "../actions";

type Res = { ok: boolean; error?: string };

export function PeopleManager({ people, myId }: { people: Profile[]; myId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  function run(key: string, fn: () => Promise<Res>, success?: string) {
    setBusy(key);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? (success ? { kind: "ok", text: success } : null) : { kind: "error", text: res.error ?? "Something went wrong." });
      setBusy(null);
    });
  }

  const pending = people.filter((p) => p.role === "pending");
  const kids = people.filter((p) => p.is_kid);
  const others = people.filter((p) => p.role !== "pending" && !p.is_kid);

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

      {/* Waiting for approval */}
      <section>
        <h2 className="mb-3 text-2xl font-bold">
          ⏳ Waiting for approval <span className="text-ink/50">({pending.length})</span>
        </h2>
        {pending.length === 0 ? (
          <p className="card p-5 text-ink/60">Nobody is waiting right now. 🎉</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="card flex flex-wrap items-center gap-3 border-sunny p-4">
                <Avatar url={p.avatar_url} emoji={p.avatar_emoji} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-lg font-bold">{p.display_name}</p>
                  <p className="truncate text-sm text-ink/60">
                    {p.email} · asked {new Date(p.created_at).toLocaleDateString()}
                  </p>
                </div>
                <button className="btn btn-mint btn-sm" disabled={busy === p.id} onClick={() => run(p.id, () => setRole(p.id, "player"), `${p.display_name} can play now!`)}>
                  <Check className="h-4 w-4" /> Approve
                </button>
                <button
                  className="btn btn-white btn-sm"
                  disabled={busy === p.id}
                  onClick={() => {
                    if (window.confirm(`Say no to ${p.display_name}? Their account will be deleted.`)) run(p.id, () => deleteUser(p.id));
                  }}
                >
                  <X className="h-4 w-4" /> Decline
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kids */}
      <section>
        <h2 className="mb-3 text-2xl font-bold">
          🧒 Kid accounts <span className="text-ink/50">({kids.length})</span>
        </h2>
        <p className="mb-3 text-ink/70">Kids sign in with a username and PIN, so no email is needed.</p>
        <NewKidForm onCreate={(input) => run("new-kid", () => createKidAccount(input), `Account created! ${input.display_name} can sign in as "${input.username.toLowerCase()}".`)} busy={busy === "new-kid"} />
        <ul className="mt-4 space-y-3">
          {kids.map((p) => (
            <PersonRow key={p.id} person={p} isMe={p.id === myId} busy={busy === p.id} run={run} />
          ))}
        </ul>
      </section>

      {/* Everyone else */}
      <section>
        <h2 className="mb-3 text-2xl font-bold">
          👨‍👩‍👧 Grown-ups & players <span className="text-ink/50">({others.length})</span>
        </h2>
        <ul className="space-y-3">
          {others.map((p) => (
            <PersonRow key={p.id} person={p} isMe={p.id === myId} busy={busy === p.id} run={run} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function PersonRow({
  person: p,
  isMe,
  busy,
  run,
}: {
  person: Profile;
  isMe: boolean;
  busy: boolean;
  run: (key: string, fn: () => Promise<Res>, success?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.display_name);
  const [emoji, setEmoji] = useState(p.avatar_emoji);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);

  return (
    <li className={`card p-4 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar url={p.avatar_url} emoji={p.avatar_emoji} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">
            {p.display_name} {isMe && <span className="text-sm text-ocean">(you)</span>}
          </p>
          <p className="truncate text-sm text-ink/60">{p.is_kid ? `username: ${p.username}` : p.email}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-bold">
          <span className="sr-only">Role</span>
          <select
            className="input w-auto py-1.5 text-sm"
            value={p.role}
            disabled={isMe || busy}
            onChange={(e) => run(p.id, () => setRole(p.id, e.target.value as Role), "Role updated.")}
          >
            <option value="player">🎮 Player</option>
            <option value="admin">🛠️ Admin</option>
            <option value="pending">⏳ Paused</option>
          </select>
        </label>
        <button className="btn btn-white btn-sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <Pencil className="h-4 w-4" /> Edit
        </button>
        {p.is_kid && (
          <button className="btn btn-white btn-sm" onClick={() => setShowPin((v) => !v)} aria-expanded={showPin}>
            <KeyRound className="h-4 w-4" /> PIN
          </button>
        )}
        {!isMe && (
          <button
            className="btn btn-berry btn-sm"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Delete ${p.display_name}'s account? Their scores and likes go too.`)) {
                run(p.id, () => deleteUser(p.id), "Account deleted.");
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">Delete</span>
          </button>
        )}
      </div>

      {editing && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-cream p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(p.id, () => updateProfile(p.id, { display_name: name, avatar_emoji: emoji }), "Saved!");
            setEditing(false);
          }}
        >
          <label className="flex-1">
            <span className="label">Name</span>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </label>
          <EmojiPicker value={emoji} onChange={setEmoji} />
          <button className="btn btn-mint btn-sm">Save</button>
        </form>
      )}

      {showPin && (
        <form
          className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-cream p-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(p.id, () => resetKidPin(p.id, pin), `New PIN set for ${p.display_name}.`);
            setPin("");
            setShowPin(false);
          }}
        >
          <label>
            <span className="label">New PIN (4-8 numbers)</span>
            <input className="input w-40 tracking-widest" inputMode="numeric" pattern="\d{4,8}" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} maxLength={8} required />
          </label>
          <button className="btn btn-ocean btn-sm">Set PIN</button>
        </form>
      )}
    </li>
  );
}

function NewKidForm({
  onCreate,
  busy,
}: {
  onCreate: (input: { display_name: string; username: string; pin: string; avatar_emoji: string }) => void;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [emoji, setEmoji] = useState("🦄");

  if (!open) {
    return (
      <button className="btn btn-berry" onClick={() => setOpen(true)}>
        <UserPlus className="h-5 w-5" /> Add a kid
      </button>
    );
  }

  return (
    <form
      className="card animate-pop-in space-y-4 border-berry p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onCreate({ display_name: name, username, pin, avatar_emoji: emoji });
        setName("");
        setUsername("");
        setPin("");
        setOpen(false);
      }}
    >
      <h3 className="text-xl font-bold">New kid account</h3>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>
          <span className="label">Name shown on the site</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required placeholder="Sam" />
        </label>
        <label>
          <span className="label">Username (for signing in)</span>
          <input
            className="input"
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
            pattern="[a-z0-9_]{3,20}"
            maxLength={20}
            required
            placeholder="super_sam"
          />
        </label>
        <label>
          <span className="label">Secret PIN (4-8 numbers)</span>
          <input
            className="input tracking-widest"
            inputMode="numeric"
            pattern="\d{4,8}"
            maxLength={8}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
            required
            placeholder="1234"
          />
        </label>
      </div>
      <EmojiPicker value={emoji} onChange={setEmoji} />
      <div className="flex gap-2">
        <button className="btn btn-mint" disabled={busy}>
          {busy ? "Creating…" : "Create account"}
        </button>
        <button type="button" className="btn btn-white" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function EmojiPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <fieldset>
      <legend className="label">Avatar</legend>
      <div className="flex flex-wrap gap-1">
        {AVATAR_EMOJIS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onChange(e)}
            aria-pressed={value === e}
            className={`grid h-9 w-9 place-items-center rounded-xl border-2 text-xl ${value === e ? "border-ink bg-sunny" : "border-transparent hover:bg-white"}`}
          >
            {e}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
