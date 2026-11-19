import Link from "next/link";

export default function NotFound() {
  return (
    <main className="carpet flex flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="text-8xl" aria-hidden>
        👾
      </div>
      <h1 className="mt-5 max-w-2xl text-4xl leading-tight text-sunny sm:text-5xl">Game over… page not found!</h1>
      <p className="mt-3 text-lg text-white/80">That page ran away. Let&apos;s go back to the arcade.</p>
      <Link href="/" className="btn btn-sunny mt-6 text-lg">
        🏠 Back to the arcade
      </Link>
    </main>
  );
}
