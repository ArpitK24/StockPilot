import clsx from "clsx";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <span className={clsx("inline-flex items-center gap-2", className)}>
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        <rect x="2" y="2" width="20" height="20" rx="5" className={light ? "fill-paper" : "fill-ink"} />
        <path d="M7 15.5h3.5V12H14V8.5h3" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={light ? "stroke-ink" : "stroke-paper"} />
        <circle cx="17" cy="8.5" r="1.9" className="fill-signal" />
      </svg>
      <span className={clsx("text-[15px] font-semibold tracking-tight", light ? "text-paper" : "text-ink")}>StockPilot</span>
    </span>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 border-b border-line pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="eyebrow mb-2">{eyebrow}</div>}
        <h1 className="font-display text-[2.15rem] leading-none tracking-tight sm:text-[2.6rem]">{title}</h1>
        {description && <p className="mt-2 max-w-xl text-sm text-ink-mute">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="rule-grid flex flex-col items-center justify-center rounded-lg border border-dashed border-line-strong px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-paper-raised text-ink-mute">{icon}</div>}
      <p className="font-display text-2xl">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-ink-mute">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Pagination({ page, pageCount, total, hrefFor, noun = "results" }: { page: number; pageCount: number; total: number; hrefFor: (p: number) => string; noun?: string }) {
  if (total === 0) return null;
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 pt-4 text-sm text-ink-mute">
      <span className="num">
        {total.toLocaleString()} {noun} · page {page} of {pageCount}
      </span>
      <div className="flex gap-1">
        <PageLink disabled={page <= 1} href={hrefFor(page - 1)} label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </PageLink>
        <PageLink disabled={page >= pageCount} href={hrefFor(page + 1)} label="Next page">
          <ChevronRight className="h-4 w-4" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({ disabled, href, label, children }: { disabled: boolean; href: string; label: string; children: React.ReactNode }) {
  if (disabled)
    return (
      <span aria-disabled className="grid h-8 w-8 place-items-center rounded-md border border-line text-ink-faint">
        {children}
      </span>
    );
  return (
    <Link href={href} aria-label={label} className="grid h-8 w-8 place-items-center rounded-md border border-line-strong bg-paper-raised text-ink hover:border-ink">
      {children}
    </Link>
  );
}

export function FieldError({ id, message }: { id?: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-st-out">
      {message}
    </p>
  );
}

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink-soft">
      {children}
      {hint && <span className="text-xs font-normal text-ink-faint">{hint}</span>}
    </label>
  );
}

/** Builds a URL that keeps current filters and overrides some. */
export function withParams(base: string, current: Record<string, string | undefined>, patch: Record<string, string | number | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...current, ...patch })) if (v !== undefined && v !== "" && v !== null) sp.set(k, String(v));
  const s = sp.toString();
  return s ? `${base}?${s}` : base;
}
