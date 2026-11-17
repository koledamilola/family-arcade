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
        className="absolute inset-0 opacity-25"
        style={{
          backgroundImage: "radial-gradient(circle, #fff 2px, transparent 2.5px)",
          backgroundSize: "22px 22px",
        }}
      />
      <span className={`relative ${small ? "text-5xl" : "text-7xl"} drop-shadow-[3px_3px_0_rgba(30,27,75,0.5)]`} aria-hidden>
        {emoji}
      </span>
    </div>
  );
}
