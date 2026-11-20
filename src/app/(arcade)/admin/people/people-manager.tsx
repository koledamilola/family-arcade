"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound, Pencil, Trash2, UserPlus, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { AVATAR_EMOJIS } from "@/lib/catalog";
import type { Invite, Profile } from "@/lib/types";
import {
  createInvite,
  createKidAccount,
  removeMember,
  renameFamily,
  resetKidPin,
  revokeInvite,
  setMemberRole,
  updateProfile,
} from "../actions";

type Res = { ok: boolean; error?: string };
type Run = (key: string, fn: () => Promise<Res>, success?: string) => void;

export function PeopleManager({
  familyName,
  people,
  invites,
  myId,
  justCreated,
}: {
  familyName: string;
  people: Profile[];
  invites: Invite[];
  myId: string;
  justCreated: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [, startTransition] = useTransition();

  const run: Run = (key, fn, success) => {
    setBusy(key);
    setNotice(null);
    startTransition(async () => {
      const res = await fn();
      setNotice(res.ok ? (success ? { kind: "ok", text: success } : null) : { kind: "error", text: res.error ?? "Something went wrong." });
      setBusy(null);
    });
  };

  const kids = people.filter((p) => p.member_role === "kid");
  const grownUps = people.filter((p) => p.member_role !== "kid");

  return (
    <div className="space-y-8">
      {justCreated && (
        <div className="card animate-pop-in border-mint p-5">
          <h2 className="text-2xl font-bold">🎉 Your family arcade is ready!</h2>
          <p className="mt-1 text-ink/75">
            Next: add an account for each kid below. They sign in with a username and PIN, so no email is needed. You
            can invite another parent or grown-up too.
          </p>
        </div>
      )}

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

      <FamilyName name={familyName} busy={busy === "family"} run={run} />

      {/* Kids */}
      <section>
        <h2 className="mb-3 text-2xl font-bold">
          🧒 Kids <span className="text-ink/50">({kids.length})</span>
        </h2>
        <p className="mb-3 text-ink/70">
          Kids sign in with a username and PIN. Games they make in the Studio wait for a parent&apos;s OK before they
          appear on the arcade.
        </p>
        <NewKidForm
          onCreate={(input) =>
            run("new-kid", () => createKidAccount(input), `Account created! ${input.display_name} can sign in as "${input.username.toLowerCase()}".`)
          }
          busy={busy === "new-kid"}
        />
        <ul className="mt-4 space-y-3">
          {kids.map((p) => (
            <PersonRow key={p.id} person={p} isMe={false} busy={busy === p.id} run={run} />
          ))}
        </ul>
      </section>

      {/* Grown-ups */}
      <section>
        <h2 className="mb-3 text-2xl font-bold">
          👨‍👩‍👧 Grown-ups <span className="text-ink/50">({grownUps.length})</span>
        </h2>
        <p className="mb-3 text-ink/70">
          <strong>Parents</strong> run the family: they manage people and games and approve kids&apos; games.{" "}
          <strong>Grown-ups</strong> play and make games, and their games go live straight away.
        </p>
        <ul className="space-y-3">
          {grownUps.map((p) => (
            <PersonRow key={p.id} person={p} isMe={p.id === myId} busy={busy === p.id} run={run} />
          ))}
        </ul>
        <Invites invites={invites} busy={busy} run={run} />
      </section>
    </div>
  );
}

function FamilyName({ name, busy, run }: { name: string; busy: boolean; run: Run }) {
  const [value, setValue] = useState(name);
  return (
    <form
      className="card flex flex-wrap items-end gap-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        run("family", () => renameFamily(value), "Family name saved.");
      }}
    >
      <label className="min-w-56 flex-1">
        <span className="label">Family name</span>
        <input className="input" value={value} onChange={(e) => setValue(e.target.value)} maxLength={60} required />
      </label>
      <button className="btn btn-ocean btn-sm" disabled={busy || value.trim() === name}>
        Save
      </button>
    </form>
  );
}

function Invites({ invites, busy, run }: { invites: Invite[]; busy: string | null; run: Run }) {
  const [copied, setCopied] = useState<string | null>(null);

  async function copy(code: string) {
    const link = `${window.location.origin}/welcome?code=${code}`;
    try {
      await navigator.clipboard.writeText(`Join our Family Arcade! Sign up at ${link} (invite code ${code})`);
      setCopied(code);
      window.setTimeout(() => setCopied(null), 2500);
    } catch {
      window.prompt("Copy this invite link:", link);
    }
  }

  return (
    <div className="card mt-4 border-dashed p-4">
      <h3 className="text-lg font-bold">✉️ Invite a grown-up</h3>
      <p className="text-sm text-ink/70">
        Make a code and send it to them. They create an account, then enter the code. Each code works once, for 7 days.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn btn-grape btn-sm"
          disabled={busy === "invite"}
          onClick={() => run("invite", () => createInvite("parent"), "Parent invite created. Copy it below.")}
        >
          <UserPlus className="h-4 w-4" /> Invite a parent
        </button>
        <button
          className="btn btn-white btn-sm"
          disabled={busy === "invite"}
          onClick={() => run("invite", () => createInvite("adult"), "Grown-up invite created. Copy it below.")}
        >
          <UserPlus className="h-4 w-4" /> Invite a grown-up
        </button>
      </div>
      {invites.length > 0 && (
        <ul className="mt-4 space-y-2">
          {invites.map((inv) => (
            <li key={inv.code} className="flex flex-wrap items-center gap-3 rounded-xl bg-cream px-3 py-2">
              <code className="font-marquee text-lg tracking-widest">{inv.code}</code>
              <span className="chip text-xs">{inv.role === "parent" ? "Parent" : "Grown-up"}</span>
              <span className="text-xs text-ink/55">until {new Date(inv.expires_at).toLocaleDateString()}</span>
              <span className="flex-1" />
              <button className="btn btn-white btn-sm" onClick={() => copy(inv.code)}>
                <Copy className="h-4 w-4" /> {copied === inv.code ? "Copied!" : "Copy invite"}
              </button>
              <button
                className="btn btn-white btn-sm"
                disabled={busy === inv.code}
                onClick={() => run(inv.code, () => revokeInvite(inv.code))}
                aria-label="Cancel invite"
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PersonRow({ person: p, isMe, busy, run }: { person: Profile; isMe: boolean; busy: boolean; run: Run }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.display_name);
  const [emoji, setEmoji] = useState(p.avatar_emoji);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const isKid = p.member_role === "kid";

  return (
    <li className={`card p-4 ${busy ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar url={p.avatar_url} emoji={p.avatar_emoji} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold">
            {p.display_name} {isMe && <span className="text-sm text-ocean">(you)</span>}
          </p>
          <p className="truncate text-sm text-ink/60">{isKid ? `username: ${p.username}` : p.email}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
        {!isKid && (
          <label className="flex items-center gap-2 text-sm font-bold">
            <span className="sr-only">Role</span>
            <select
              className="input w-auto py-1.5 text-sm"
              value={p.member_role ?? "adult"}
              disabled={isMe || busy}
              onChange={(e) => run(p.id, () => setMemberRole(p.id, e.target.value as "parent" | "adult"), "Role updated.")}
            >
              <option value="parent">👑 Parent</option>
              <option value="adult">🙂 Grown-up</option>
            </select>
          </label>
        )}
        <button className="btn btn-white btn-sm" onClick={() => setEditing((v) => !v)} aria-expanded={editing}>
          <Pencil className="h-4 w-4" /> Edit
        </button>
        {isKid && (
          <button className="btn btn-white btn-sm" onClick={() => setShowPin((v) => !v)} aria-expanded={showPin}>
            <KeyRound className="h-4 w-4" /> PIN
          </button>
        )}
        {!isMe && (
          <button
            className="btn btn-berry btn-sm"
            disabled={busy}
            onClick={() => {
              const question = isKid
                ? `Delete ${p.display_name}'s account? Their scores and likes go too.`
                : `Remove ${p.display_name} from the family? They keep their login and can be invited back.`;
              if (window.confirm(question)) run(p.id, () => removeMember(p.id), isKid ? "Account deleted." : "Removed from the family.");
            }}
          >
            <Trash2 className="h-4 w-4" />
            <span className="sr-only">{isKid ? "Delete" : "Remove"}</span>
          </button>
        )}
        </div>
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
      <p className="text-sm text-ink/60">Usernames are shared across every family on Family Arcade, so pick something unique.</p>
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
