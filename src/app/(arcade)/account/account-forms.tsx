"use client";

import { useState, useTransition } from "react";
import { AVATAR_EMOJIS } from "@/lib/catalog";
import { deleteMyAccount, updateMyProfile } from "./actions";

export function AccountForms({
  name: initialName,
  emoji: initialEmoji,
  email,
  familyName,
  soleParent,
}: {
  name: string;
  emoji: string;
  email: string;
  familyName: string;
  soleParent: boolean;
}) {
  const [name, setName] = useState(initialName);
  const [emoji, setEmoji] = useState(initialEmoji);
  const [confirm, setConfirm] = useState("");
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-6">
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

      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await updateMyProfile({ display_name: name, avatar_emoji: emoji });
            setNotice(res.ok ? { kind: "ok", text: "Saved!" } : { kind: "error", text: res.error });
          });
        }}
      >
        <h2 className="text-xl font-bold">Profile</h2>
        <p className="text-sm text-ink/60">Signed in as {email}</p>
        <label className="block">
          <span className="label">Your name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
        </label>
        <fieldset>
          <legend className="label">Avatar</legend>
          <div className="flex flex-wrap gap-1">
            {AVATAR_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                aria-pressed={emoji === e}
                className={`grid h-9 w-9 place-items-center rounded-xl border-2 text-xl ${emoji === e ? "border-ink bg-sunny" : "border-transparent hover:bg-cream"}`}
              >
                {e}
              </button>
            ))}
          </div>
        </fieldset>
        <button className="btn btn-mint btn-sm" disabled={pending}>
          Save
        </button>
      </form>

      <form
        className="card space-y-3 border-berry p-5"
        onSubmit={(e) => {
          e.preventDefault();
          const question = soleParent
            ? `This deletes ${familyName} completely: every kid's account, every game and every score. This can't be undone. Continue?`
            : "Delete your account? This can't be undone.";
          if (!window.confirm(question)) return;
          startTransition(async () => {
            const res = await deleteMyAccount(confirm);
            if (res && !res.ok) setNotice({ kind: "error", text: res.error });
          });
        }}
      >
        <h2 className="text-xl font-bold text-berry">Delete my account</h2>
        {soleParent ? (
          <p className="text-ink/75">
            You&apos;re the only parent in <strong>{familyName}</strong>, so deleting your account deletes the{" "}
            <strong>whole family</strong>: every kid&apos;s account, every game and every score. To keep the family,
            invite another parent first (Family → People). Type <strong>{familyName}</strong> below to confirm.
          </p>
        ) : (
          <p className="text-ink/75">
            Your login, likes and scores are deleted. Games you uploaded stay with the family. Type <strong>DELETE</strong> to confirm.
          </p>
        )}
        <input className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={soleParent ? familyName : "DELETE"} />
        <button className="btn btn-berry btn-sm" disabled={pending || !confirm.trim()}>
          {pending ? "Working…" : soleParent ? "Delete my account and family" : "Delete my account"}
        </button>
      </form>
    </div>
  );
}
