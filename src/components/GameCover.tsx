/* eslint-disable @next/next/no-img-element */
import { COVER_COLORS } from "@/lib/catalog";

export function GameCover({
  title,
  thumbnailUrl,
  emoji,
  color,
  className = "",
  small = false,
}: {
  title: string;
  thumbnailUrl?: string | null;
  emoji: string;
  color: string;
  className?: string;
  small?: boolean;
}) {
  if (thumbnailUrl) {
    return <img src={thumbnailUrl} alt={`${title} cover`} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div
      className={`relative grid h-full w-full place-items-center overflow-hidden ${className}`}
      style={{ background: COVER_COLORS[color] ?? COVER_COLORS.sky }}
      aria-label={`${title} cover`}
    >
      <div
        aria-hidden
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(rgb(255 255 255 / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 0.5) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      <span className={`relative ${small ? "text-5xl" : "text-7xl"} drop-shadow-[0_4px_0_rgba(27,20,70,0.35)]`} aria-hidden>
        {emoji}
      </span>
    </div>
  );
}
