import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-[70dvh] place-items-center px-6">
      <div className="text-center">
        <p className="eyebrow">404</p>
        <h1 className="mt-3 font-display text-5xl">Nothing on this shelf.</h1>
        <p className="mt-3 text-sm text-ink-mute">It doesn&apos;t exist, or it belongs to a workspace you&apos;re not part of.</p>
        <Link href="/workspaces" className="btn-primary mt-6">
          Back to your workspaces
        </Link>
      </div>
    </div>
  );
}
