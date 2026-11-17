import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="animate-float text-8xl" aria-hidden>
        👾
      </div>
      <h1 className="mt-4 text-4xl font-bold">Game over… page not found!</h1>
      <p className="mt-2 text-lg text-ink/70">That page ran away. Let&apos;s go back to the arcade.</p>
      <Link href="/" className="btn btn-sunny mt-6 text-lg">
        🏠 Back to the arcade
      </Link>
    </main>
  );
}
