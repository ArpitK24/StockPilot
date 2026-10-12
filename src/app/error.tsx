"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <div className="text-center">
        <p className="eyebrow">Something broke</p>
        <h1 className="mt-3 font-display text-5xl">That didn&apos;t load.</h1>
        <p className="mt-3 text-sm text-ink-mute">It&apos;s been logged. Try again in a moment.</p>
        <button onClick={reset} className="btn-primary mt-6">
          Try again
        </button>
      </div>
    </div>
  );
}
