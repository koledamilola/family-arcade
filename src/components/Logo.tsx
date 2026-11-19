import { SITE_NAME } from "@/lib/env";

/** An arcade token with the site name in marquee letters. Made for dark (carpet) backgrounds. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const big = size === "lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={`grid shrink-0 place-items-center rounded-full border-2 border-ink bg-sunny ${
          big ? "h-16 w-16 text-3xl" : "h-10 w-10 text-xl"
        }`}
        style={{ boxShadow: "inset 0 0 0 3px #ffc83d, inset 0 0 0 5px rgb(27 20 70 / 0.35)" }}
        aria-hidden
      >
        🕹️
      </span>
      <span
        className={`font-marquee leading-none whitespace-nowrap text-sunny ${big ? "text-[26px] sm:text-4xl" : "text-lg sm:text-2xl"}`}
      >
        {SITE_NAME}
      </span>
    </span>
  );
}
