/* eslint-disable @next/next/no-img-element */
export function Avatar({
  url,
  emoji,
  name,
  size = 36,
}: {
  url?: string | null;
  emoji?: string | null;
  name?: string;
  size?: number;
}) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-ink bg-sunny"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      title={name}
    >
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        <span aria-hidden>{emoji || "🙂"}</span>
      )}
    </span>
  );
}
