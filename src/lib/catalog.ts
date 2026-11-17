export const CATEGORIES = [
  { name: "Shooter", emoji: "🚀" },
  { name: "Fighting", emoji: "🥊" },
  { name: "Platformer", emoji: "🍄" },
  { name: "Racing", emoji: "🏎️" },
  { name: "Puzzle", emoji: "🧩" },
  { name: "Adventure", emoji: "🗺️" },
  { name: "Sports", emoji: "⚽" },
  { name: "Arcade", emoji: "👾" },
  { name: "Other", emoji: "✨" },
] as const;

export function categoryEmoji(name: string) {
  return CATEGORIES.find((c) => c.name === name)?.emoji ?? "✨";
}

/** Bright cover colours for games without a picture. */
export const COVER_COLORS: Record<string, string> = {
  sky: "linear-gradient(135deg, #38bdf8, #6366f1)",
  sunny: "linear-gradient(135deg, #fde047, #fb923c)",
  berry: "linear-gradient(135deg, #f472b6, #a855f7)",
  mint: "linear-gradient(135deg, #4ade80, #14b8a6)",
  coral: "linear-gradient(135deg, #fb7185, #f97316)",
  grape: "linear-gradient(135deg, #a78bfa, #ec4899)",
};

export const AVATAR_EMOJIS = ["🙂", "😎", "🦄", "🐱", "🐶", "🦊", "🐼", "🐸", "🦖", "🤖", "👽", "🐙", "🦁", "🐧", "⚡", "🌟"];

export function slugify(text: string) {
  return (
    text
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "game"
  );
}

export function formatScore(n: number) {
  return Number.isInteger(n) ? n.toLocaleString() : n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
