"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileArchive, FileCode2, Globe, ImagePlus, X } from "lucide-react";
import { GameCover } from "@/components/GameCover";
import { CATEGORIES, COVER_COLORS } from "@/lib/catalog";
import { extensionOf, mimeFor } from "@/lib/mime";
import { createClient } from "@/lib/supabase/client";
import type { Game, GameKind } from "@/lib/types";
import { type GameFile, readGameZip } from "@/lib/zip";
import { type GameInput, discardUpload, prepareGameUpload, prepareThumbnailUpload, saveGame, clearScores } from "../actions";

const EMOJI_IDEAS = ["🎮", "🚀", "🥊", "👾", "🐉", "⚔️", "🏎️", "⚽", "🧩", "🦖", "🤖", "🏰", "🔫", "💥", "🌋", "🐱"];

export function GameForm({ game }: { game?: Game }) {
  const router = useRouter();
  const editing = Boolean(game);

  const [title, setTitle] = useState(game?.title ?? "");
  const [creator, setCreator] = useState(game?.creator_name ?? "");
  const [category, setCategory] = useState(game?.category ?? "Arcade");
  const [description, setDescription] = useState(game?.description ?? "");
  const [controls, setControls] = useState(game?.controls ?? "");
  const [emoji, setEmoji] = useState(game?.cover_emoji ?? "🎮");
  const [color, setColor] = useState(game?.cover_color ?? "sky");
  const [thumbUrl, setThumbUrl] = useState<string | null>(game?.thumbnail_url ?? null);
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);

  const [kind, setKind] = useState<GameKind>(game?.kind ?? "html");
  const [gameFile, setGameFile] = useState<File | null>(null);
  const [externalUrl, setExternalUrl] = useState(game?.external_url ?? "");

  const [hasScores, setHasScores] = useState(game?.has_scores ?? false);
  const [scoreLabel, setScoreLabel] = useState(game?.score_label ?? "Score");
  const [lowerBetter, setLowerBetter] = useState(game?.lower_is_better ?? false);
  const [touch, setTouch] = useState(game?.supports_touch ?? false);
  const [gamepad, setGamepad] = useState(game?.supports_gamepad ?? false);
  const [published, setPublished] = useState(game ? game.status === "published" : true);

  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const keepingFiles = editing && kind === game?.kind && kind !== "url" && !gameFile;

  function pickThumb(file: File | null) {
    setThumbFile(file);
    setThumbPreview(file ? URL.createObjectURL(file) : null);
  }

  async function uploadGameFiles(files: GameFile[]) {
    const prep = await prepareGameUpload(files.map((f) => f.path));
    if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Upload failed" : prep.error);
    const { prefix, uploads } = prep.data;
    const supabase = createClient();
    let done = 0;
    const byPath = new Map(files.map((f) => [f.path, f.data]));
    const queue = [...uploads];
    setProgress(`Uploading files… 0 / ${uploads.length}`);
    try {
      await Promise.all(
        Array.from({ length: Math.min(6, queue.length) }, async () => {
          for (let u = queue.shift(); u; u = queue.shift()) {
            const { error } = await supabase.storage
              .from("games")
              .uploadToSignedUrl(`${prefix}/${u.path}`, u.token, byPath.get(u.path)!, {
                contentType: mimeFor(u.path),
                cacheControl: "31536000",
              });
            if (error) throw new Error(`Couldn't upload ${u.path}: ${error.message}`);
            done++;
            setProgress(`Uploading files… ${done} / ${uploads.length}`);
          }
        }),
      );
    } catch (e) {
      await discardUpload(prefix);
      throw e;
    }
    return prefix;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    let newPrefix: string | null = null;
    try {
      let storage_prefix = game?.storage_prefix ?? null;
      let entry_path = game?.entry_path ?? null;

      if (kind === "url") {
        if (!/^https?:\/\//i.test(externalUrl.trim())) throw new Error("Paste the full game link, starting with https://");
      } else if (gameFile) {
        let files: GameFile[];
        if (kind === "zip") {
          setProgress("Opening the zip…");
          const z = await readGameZip(gameFile);
          files = z.files;
          entry_path = z.entry;
        } else {
          files = [{ path: "index.html", data: gameFile }];
          entry_path = "index.html";
        }
        const tooBig = files.find((f) => f.data.size > 50 * 1024 * 1024);
        if (tooBig) throw new Error(`${tooBig.path} is bigger than 50 MB, which is the storage limit.`);
        storage_prefix = await uploadGameFiles(files);
        newPrefix = storage_prefix;
      } else if (!keepingFiles) {
        throw new Error(kind === "zip" ? "Choose the game's .zip file." : "Choose the game's .html file.");
      }

      let thumbnail_url = thumbUrl;
      if (thumbFile) {
        setProgress("Uploading cover picture…");
        const prep = await prepareThumbnailUpload(extensionOf(thumbFile.name));
        if (!prep.ok || !prep.data) throw new Error(prep.ok ? "Upload failed" : prep.error);
        const { error } = await createClient()
          .storage.from("thumbnails")
          .uploadToSignedUrl(prep.data.path, prep.data.token, thumbFile, { contentType: thumbFile.type || "image/png" });
        if (error) throw new Error(`Couldn't upload the cover picture: ${error.message}`);
        thumbnail_url = prep.data.publicUrl;
      }

      setProgress("Saving…");
      const input: GameInput = {
        id: game?.id,
        title,
        description,
        creator_name: creator,
        category,
        controls,
        cover_emoji: emoji,
        cover_color: color,
        thumbnail_url,
        kind,
        storage_prefix: kind === "url" ? null : storage_prefix,
        entry_path: kind === "url" ? null : entry_path,
        external_url: kind === "url" ? externalUrl.trim() : null,
        has_scores: hasScores,
        score_label: scoreLabel,
        lower_is_better: lowerBetter,
        supports_touch: touch,
        supports_gamepad: gamepad,
        published,
      };
      const res = await saveGame(input);
      if (!res.ok) throw new Error(res.error);
      newPrefix = null;
      router.push(`/admin?saved=${encodeURIComponent(res.data?.slug ?? "")}`);
      router.refresh();
    } catch (err) {
      if (newPrefix) await discardUpload(newPrefix);
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
      setProgress(null);
    }
  }

  const coverSrc = thumbPreview ?? thumbUrl;

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-6">
        {/* Basics */}
        <Section title="📝 About the game">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Game title" className="sm:col-span-2">
              <input className="input text-lg" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder="Space Blaster 3000" />
            </Field>
            <Field label="Made by">
              <input className="input" value={creator} onChange={(e) => setCreator(e.target.value)} maxLength={60} placeholder="e.g. Sam (age 10)" />
            </Field>
            <Field label="Category">
              <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.emoji} {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Description" className="sm:col-span-2">
              <textarea className="input min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="What's the game about?" />
            </Field>
            <Field label="How to play (controls)" className="sm:col-span-2">
              <textarea className="input min-h-20" value={controls} onChange={(e) => setControls(e.target.value)} maxLength={1000} placeholder={"Arrow keys to move\nSpace to shoot"} />
            </Field>
          </div>
        </Section>

        {/* Files */}
        <Section title="📦 Game files">
          <div className="grid gap-2 sm:grid-cols-3">
            <KindOption active={kind === "html"} onClick={() => { setKind("html"); setGameFile(null); }} icon={<FileCode2 />} title="HTML file" hint="One .html file" />
            <KindOption active={kind === "zip"} onClick={() => { setKind("zip"); setGameFile(null); }} icon={<FileArchive />} title="Zip folder" hint="index.html + assets" />
            <KindOption active={kind === "url"} onClick={() => { setKind("url"); setGameFile(null); }} icon={<Globe />} title="Web link" hint="Hosted elsewhere" />
          </div>

          {kind === "url" ? (
            <Field label="Game link" className="mt-4">
              <input className="input" type="url" value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} placeholder="https://…" required />
              <p className="mt-1.5 text-sm text-ink/60">
                Works for games on sites like itch.io, Replit or CodePen that allow embedding. Leaderboards and saves are
                only available for uploaded games.
              </p>
            </Field>
          ) : (
            <div className="mt-4">
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-[3px] border-dashed border-ink/40 bg-cream p-6 text-center transition hover:border-ocean hover:bg-ocean/5">
                <span className="text-4xl" aria-hidden>{kind === "zip" ? "🗜️" : "📄"}</span>
                <span className="font-display text-lg font-semibold">
                  {gameFile ? gameFile.name : keepingFiles ? "Keeping the current files. Click to replace them." : `Choose a ${kind === "zip" ? ".zip" : ".html"} file`}
                </span>
                {gameFile && <span className="text-sm text-ink/60">{(gameFile.size / 1024 / 1024).toFixed(2)} MB</span>}
                <input
                  type="file"
                  className="sr-only"
                  accept={kind === "zip" ? ".zip,application/zip" : ".html,.htm,text/html"}
                  onChange={(e) => setGameFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {kind === "zip" && (
                <p className="mt-2 text-sm text-ink/60">
                  Zip the whole game folder. It needs an <code>index.html</code>. Exports from Phaser, Godot (Web),
                  Construct, GDevelop, PICO-8 and Unity WebGL work. For Unity, set <em>Compression Format</em> to{" "}
                  <em>Disabled</em> or turn on <em>Decompression Fallback</em>.
                </p>
              )}
            </div>
          )}
        </Section>

        {/* Leaderboard */}
        <Section title="🏆 Leaderboard & devices">
          <Toggle checked={hasScores} onChange={setHasScores} label="This game has a leaderboard" hint="The game sends scores with FamilyArcade.submitScore(points). See the Game Maker Guide." />
          {hasScores && (
            <div className="mt-3 grid gap-4 rounded-2xl bg-cream p-4 sm:grid-cols-2">
              <Field label="What is the score called?">
                <input className="input" value={scoreLabel} onChange={(e) => setScoreLabel(e.target.value)} maxLength={24} placeholder="Score, Time, Coins…" />
              </Field>
              <div className="flex items-end">
                <Toggle checked={lowerBetter} onChange={setLowerBetter} label="Lower is better" hint="e.g. fastest time" />
              </div>
              {editing && game?.has_scores && (
                <button
                  type="button"
                  className="btn btn-white btn-sm justify-self-start"
                  onClick={async () => {
                    if (window.confirm("Wipe every score for this game?")) {
                      const r = await clearScores(game.id);
                      window.alert(r.ok ? "Leaderboard cleared." : r.error);
                    }
                  }}
                >
                  🧹 Clear leaderboard
                </button>
              )}
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Toggle checked={touch} onChange={setTouch} label="📱 Works on touch screens" />
            <Toggle checked={gamepad} onChange={setGamepad} label="🎮 Works with controllers" />
          </div>
        </Section>
      </div>

      {/* Side column */}
      <div className="space-y-6">
        <Section title="🖼️ Cover">
          <div className="aspect-[4/3] overflow-hidden rounded-2xl border-[3px] border-ink">
            <GameCover title={title || "Game"} thumbnailUrl={coverSrc} emoji={emoji} color={color} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <label className="btn btn-white btn-sm cursor-pointer">
              <ImagePlus className="h-4 w-4" /> {coverSrc ? "Change picture" : "Upload picture"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => pickThumb(e.target.files?.[0] ?? null)} />
            </label>
            {coverSrc && (
              <button type="button" className="btn btn-white btn-sm" onClick={() => { pickThumb(null); setThumbUrl(null); }}>
                <X className="h-4 w-4" /> Remove
              </button>
            )}
          </div>
          {!coverSrc && (
            <div className="mt-4 space-y-3">
              <p className="label">No picture? Pick an emoji and colour:</p>
              <div className="flex flex-wrap gap-1.5">
                {EMOJI_IDEAS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setEmoji(e)}
                    className={`grid h-10 w-10 place-items-center rounded-xl border-2 text-2xl ${emoji === e ? "border-ink bg-sunny" : "border-transparent hover:bg-cream"}`}
                  >
                    {e}
                  </button>
                ))}
                <input className="input h-10 w-16 px-2 text-center text-xl" value={emoji} onChange={(e) => setEmoji(e.target.value)} aria-label="Custom emoji" maxLength={16} />
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(COVER_COLORS).map(([name, bg]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setColor(name)}
                    aria-label={name}
                    className={`h-9 w-9 rounded-full border-[3px] ${color === name ? "border-ink ring-4 ring-sunny" : "border-white"}`}
                    style={{ background: bg }}
                  />
                ))}
              </div>
            </div>
          )}
        </Section>

        <Section title="👀 Visibility">
          <Toggle checked={published} onChange={setPublished} label="Show on the arcade" hint="Turn off to hide it while you test it." />
        </Section>

        <div className="card space-y-3 p-5 lg:sticky lg:top-24">
          {error && (
            <p role="alert" className="rounded-2xl border-2 border-berry bg-berry/10 px-3 py-2 text-sm font-semibold text-berry">
              {error}
            </p>
          )}
          {progress && <p className="font-display font-semibold text-ocean">⏳ {progress}</p>}
          <button className="btn btn-mint w-full py-3 text-lg" disabled={busy}>
            {busy ? "Working…" : editing ? "💾 Save changes" : "🚀 Add game"}
          </button>
          <Link href="/admin" className="btn btn-white w-full">
            Cancel
          </Link>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-4 text-xl font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

function KindOption({ active, onClick, icon, title, hint }: { active: boolean; onClick: () => void; icon: React.ReactNode; title: string; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-2xl border-[3px] p-3 text-left transition ${
        active ? "border-ink bg-sunny shadow-pop-sm" : "border-ink/20 hover:border-ink"
      }`}
    >
      <span className="[&>svg]:h-7 [&>svg]:w-7">{icon}</span>
      <span>
        <span className="block font-display font-semibold">{title}</span>
        <span className="block text-xs text-ink/60">{hint}</span>
      </span>
    </button>
  );
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full border-[3px] border-ink transition peer-focus-visible:ring-4 peer-focus-visible:ring-sunny ${checked ? "bg-mint" : "bg-ink/15"}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full border-2 border-ink bg-white transition-all ${checked ? "left-6" : "left-0.5"}`} />
      </span>
      <span>
        <span className="block font-semibold">{label}</span>
        {hint && <span className="block text-sm text-ink/60">{hint}</span>}
      </span>
    </label>
  );
}
