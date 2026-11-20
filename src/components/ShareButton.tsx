"use client";

import { useState } from "react";
import { Link2 } from "lucide-react";

/** Copies (or natively shares) a public link to a game. */
export function ShareButton({ path, title, className = "btn btn-ocean btn-sm" }: { path: string; title: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = new URL(path, window.location.origin).toString();
    try {
      if (navigator.share && window.matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ title, text: `Play ${title}!`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  return (
    <button type="button" className={className} onClick={share} title="Anyone with this link can play, no account needed">
      <Link2 className="h-4 w-4" /> {copied ? "Link copied!" : "Share link"}
    </button>
  );
}
