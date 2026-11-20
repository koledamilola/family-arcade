"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { createProject } from "./actions";

const IDEAS = [
  "🐱 A cat that jumps between rooftops collecting fish",
  "🚀 A spaceship dodging asteroids and grabbing stars",
  "🧩 A puzzle where you slide blocks to free a robot",
  "🏎️ A racing game on a rainbow road",
  "🐉 A tiny dragon that has to protect its eggs",
  "⚽ Penalty shootout against a goalie that gets better",
];

export function NewProject({ disabled, isKid }: { disabled: boolean; isKid: boolean }) {
  const [idea, setIdea] = useState("");
  const [pending, startTransition] = useTransition();

  function start(text: string) {
    startTransition(async () => {
      await createProject(text);
    });
  }

  return (
    <section className="card mt-6 border-grape p-5 sm:p-6">
      <h2 className="text-2xl font-bold">✨ Start a new game</h2>
      <p className="mt-1 text-ink/70">
        {isKid ? "What game do you dream about? Say it in one sentence. The coach will help with the rest!" : "Describe your idea in a sentence or two. The coach fills in the gaps with you."}
      </p>
      <form
        className="mt-4 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          start(idea);
        }}
      >
        <input
          className="input flex-1 text-lg"
          value={idea}
          onChange={(e) => setIdea(e.target.value)}
          maxLength={500}
          placeholder="A game where…"
          disabled={disabled || pending}
        />
        <button className="btn btn-grape py-3" disabled={disabled || pending || !idea.trim()}>
          <Sparkles className="h-5 w-5" /> {pending ? "Asking the coach…" : "Start"}
        </button>
      </form>
      <p className="mt-4 mb-2 text-sm font-bold text-ink/60">Need an idea? Tap one:</p>
      <div className="flex flex-wrap gap-2">
        {IDEAS.map((i) => (
          <button key={i} type="button" className="chip hover:bg-cream" disabled={disabled || pending} onClick={() => start(i.slice(i.indexOf(" ") + 1))}>
            {i}
          </button>
        ))}
      </div>
    </section>
  );
}
