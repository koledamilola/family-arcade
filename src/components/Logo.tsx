import { SITE_NAME } from "@/lib/env";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`grid place-items-center rounded-2xl border-[3px] border-ink bg-sunny shadow-pop-sm ${
          big ? "h-16 w-16 text-4xl" : "h-10 w-10 text-2xl"
        }`}
        aria-hidden
      >
        <span className="animate-wiggle inline-block">🕹️</span>
      </span>
      <span
        className={`font-display font-bold leading-none tracking-tight ${big ? "text-4xl sm:text-5xl" : "text-xl sm:text-2xl"}`}
      >
        {SITE_NAME.split(" ").map((word, i) => (
          <span key={i} className={i % 2 === 0 ? "text-berry" : "text-ocean"}>
            {i > 0 ? " " : ""}
            {word}
          </span>
        ))}
      </span>
    </span>
  );
}
